from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass, field
import csv
import io
import json
import logging
import importlib.util
import math
import os
import hmac
from pathlib import Path
import shutil
import subprocess
import threading
import time
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator
import soundfile as sf

from .analysis import analyze, SR
from .demo import make_demo
from .score import build_score, defaults
from .chart import chord_chart, chord_status
from .separation import STEMS, SETUP_MESSAGE, available as separation_available, separate_audio
from .vocal_removal import SETUP_MESSAGE as VOCAL_SETUP_MESSAGE, available as vocal_removal_available, remove_vocals
from .theory import catalog, chord_info, enrich, PITCHES, QUALITIES
from . import hosting

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = Path(os.getenv("FRETFLOW_RUNTIME", str(ROOT / ".runtime" / "jobs")))
MAX_BYTES = int(os.getenv("FRETFLOW_MAX_UPLOAD_MIB", "200")) * 1024 * 1024
MAX_DURATION = int(os.getenv("FRETFLOW_MAX_DURATION", "180"))
TTL = 24 * 3600
ALLOWED = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".aiff", ".aif", ".webm", ".mp4", ".mov", ".m4v", ".mkv", ".avi", ".mpeg", ".mpg", ".3gp"}
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="audio-models")
lock = threading.RLock()
jobs: dict[str, "Job"] = {}


@dataclass
class Job:
    id: str
    name: str
    mode: str
    sensitivity: float
    owner_id: str | None = None
    clip_start: float = 0.
    clip_end: float | None = None
    separation: str = "none"
    source_offset: float = 0.
    parent_id: str | None = None
    legacy_source: bool = False
    created: float = field(default_factory=time.time)
    status: str = "queued"
    progress: int = 0
    stage: str = "等待分析"
    error: str | None = None
    result: dict | None = None
    cancel: threading.Event = field(default_factory=threading.Event)

    @property
    def folder(self) -> Path:
        return RUNTIME / self.id


def cleanup():
    with lock:
        for id, job in list(jobs.items()):
            if time.time() - job.created > TTL and job.status not in ("queued", "running"):
                jobs.pop(id)
                shutil.rmtree(job.folder, ignore_errors=True)


@asynccontextmanager
async def lifespan(app):
    if hosting.enabled() and len(os.getenv("FRETFLOW_WORKER_TOKEN", "")) < 32:
        raise RuntimeError("Hosted worker requires a strong FRETFLOW_WORKER_TOKEN")
    RUNTIME.mkdir(parents=True, exist_ok=True)
    if os.getenv("FRETFLOW_WARM_MODELS", "1" if hosting.enabled() else "0") == "1":
        from .runtime import warm_models
        executor.submit(warm_models)
    for folder in RUNTIME.iterdir():
        if not folder.is_dir():
            continue
        try:
            pending = folder / "pending.json"
            if not (folder / "result.json").exists() and pending.exists():
                saved = json.loads(pending.read_text())
                if time.time() - saved["created"] > TTL:
                    shutil.rmtree(folder)
                    continue
                job = Job(id=folder.name, **{key: saved[key] for key in (
                    "name", "mode", "sensitivity", "owner_id", "created", "clip_start", "clip_end",
                    "separation", "source_offset", "parent_id", "legacy_source")})
                source = folder / Path(saved["source"]).name
                if not source.is_file():
                    source = folder / "audio.wav"
                if source.is_file():
                    jobs[job.id] = job
                    executor.submit(work, job, source)
                else:
                    shutil.rmtree(folder)
                continue
            saved = json.loads((folder / "result.json").read_text())
            if time.time() - saved["created"] > TTL:
                shutil.rmtree(folder)
                continue
            if (folder / "audio.wav").is_file():
                jobs[folder.name] = Job(id=folder.name, name=saved["name"], mode=saved["mode"],
                    sensitivity=saved["sensitivity"], created=saved["created"], status="done", progress=100, stage="分析完成", result=saved,
                    clip_start=saved.get("clip_start", 0), separation=saved.get("separation", {}).get("mode", "guitar" if saved.get("separation", {}).get("enabled") else "none"),
                    parent_id=saved.get("parent_id"), legacy_source=saved.get("legacy_source", False))
                owner_file = folder / "owner.txt"
                jobs[folder.name].owner_id = owner_file.read_text().strip() if owner_file.exists() else None
        except (OSError, ValueError, KeyError):
            if time.time() - folder.stat().st_mtime > TTL:
                shutil.rmtree(folder, ignore_errors=True)
    import asyncio
    async def periodic_cleanup():
        while True:
            await asyncio.sleep(300)
            await asyncio.to_thread(cleanup)
    cleaner = asyncio.create_task(periodic_cleanup())
    try:
        yield
    finally:
        cleaner.cancel()
        from contextlib import suppress
        with suppress(asyncio.CancelledError):
            await cleaner
        executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="FretFlow Media Transcription", lifespan=lifespan)


@app.middleware("http")
async def local_origin_only(request: Request, call_next):
    token = os.getenv("FRETFLOW_WORKER_TOKEN")
    origin = request.headers.get("origin")
    ticket = request.headers.get("x-fretflow-ticket") or request.query_params.get("ticket")
    if hosting.enabled() and request.method == "OPTIONS" and hosting.allowed_origin(origin):
        return Response(status_code=204, headers={"Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, GET, HEAD", "Access-Control-Allow-Headers": "Content-Type, X-FretFlow-Ticket, Range",
            "Access-Control-Max-Age": "300", "Vary": "Origin"})
    user = None
    if hosting.enabled() and ticket:
        try:
            claim = hosting.verify_ticket(ticket, request.method, request.url.path, origin, RUNTIME)
            user = claim["owner"]
        except HTTPException as exc:
            from fastapi.responses import JSONResponse
            response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
            if hosting.allowed_origin(origin):
                response.headers["Access-Control-Allow-Origin"] = origin
            return response
    elif token and not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
        return Response("Unauthorized", status_code=401)
    elif hosting.enabled():
        user = request.headers.get("x-fretflow-owner")
        if not hosting.valid_owner(user):
            return Response("Missing user session", status_code=401)
    if not hosting.enabled() and request.method not in ("GET", "HEAD", "OPTIONS") and origin and origin not in {
        "http://127.0.0.1:8770", "http://localhost:8770", "http://127.0.0.1:8771", "http://localhost:8771", "http://localhost:3000", "http://127.0.0.1:3000"
    }:
        return Response("本地服务不接受外部页面请求", status_code=403)
    if hosting.enabled() and origin and not hosting.allowed_origin(origin):
        return Response("Origin not allowed", status_code=403)
    context = hosting.owner.set(user)
    try:
        response = await call_next(request)
    finally:
        hosting.owner.reset(context)
    if hosting.enabled() and hosting.allowed_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


def get_job(id: str) -> Job:
    with lock:
        job = jobs.get(id)
        if not job or (hosting.enabled() and job.owner_id != hosting.owner.get()):
            raise HTTPException(404, "分析记录已过期或不存在")
        return job


def save_result(job: Job):
    temporary = job.folder / "result.json.tmp"
    temporary.write_text(json.dumps(job.result, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(job.folder / "result.json")
    (job.folder / "pending.json").unlink(missing_ok=True)


def queue_job(job: Job, source: Path):
    saved = {key: getattr(job, key) for key in (
        "name", "mode", "sensitivity", "owner_id", "created", "clip_start", "clip_end",
        "separation", "source_offset", "parent_id", "legacy_source")}
    saved["source"] = source.name
    temporary = job.folder / "pending.json.tmp"
    temporary.write_text(json.dumps(saved))
    temporary.replace(job.folder / "pending.json")
    executor.submit(work, job, source)


def work(job: Job, source: Path):
    started = time.monotonic()
    def progress(value, stage):
        if job.cancel.is_set():
            raise InterruptedError("分析已取消")
        with lock:
            job.status, job.progress, job.stage = "running", value, stage
    try:
        progress(5, "读取媒体，抽取所选片段的音轨")
        target = job.folder / "audio.wav"
        if source != target:
            try:
                probe = subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", str(source)], check=True, capture_output=True, timeout=20)
                metadata = json.loads(probe.stdout)
                if not any(stream.get("codec_type") == "audio" for stream in metadata.get("streams", [])):
                    raise ValueError("这个文件没有可读取的音轨，请选择带声音的视频或音频。")
                duration = float(metadata.get("format", {}).get("duration", 0))
                if job.clip_end is not None and (job.clip_end <= job.clip_start or job.clip_end - job.clip_start > MAX_DURATION):
                    raise ValueError("Clip exceeds the server duration limit. Select a shorter segment.")
                if duration and job.clip_start >= duration:
                    raise ValueError("片段起点超出了文件时长。")
                limit = job.clip_end - job.clip_start if job.clip_end is not None else MAX_DURATION + 1
                subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe",
                    "-ss", str(job.clip_start), "-i", str(source), "-map", "0:a:0", "-t", str(limit), "-vn",
                    "-ac", "2" if job.separation != "none" else "1", "-ar", "44100" if job.separation != "none" else str(SR),
                    "-c:a", "pcm_f32le" if job.separation != "none" else "pcm_s16le", "-y", str(target)], check=True, capture_output=True, timeout=60)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
                raise ValueError("无法读取音频或视频音轨，请确认文件未损坏且包含声音。") from exc
            finally:
                source.unlink(missing_ok=True)
        if sf.info(target).duration > MAX_DURATION:
            raise ValueError("Clip exceeds the server duration limit. Select a shorter segment.")
        prepared_at = time.monotonic()
        cached = job.folder / "prepared-stems.json"
        reused = json.loads(cached.read_text()) if cached.is_file() else None
        if job.separation == "instrumental":
            separation = reused or remove_vocals(target, job.folder / "stems", progress)
            result = analyze(job.folder / "stems/instrumental.wav", job.mode, job.sensitivity,
                             lambda value, stage: progress(60 + int(value * .37), stage))
            result["separation"] = separation
            result.setdefault("warnings", []).append("本次使用去人声伴奏扒谱。分离可能残留人声或损失部分吉他音色；伴奏中的其他乐器仍会影响识别。")
        elif job.separation == "guitar":
            separation = reused or separate_audio(target, job.folder / "stems", progress)
            result = analyze(target, job.mode, job.sensitivity,
                             lambda value, stage: progress(60 + int(value * .37), stage),
                             notes_path=job.folder / "stems/guitar.wav")
            result["separation"] = {**separation, "mode": "guitar"}
        else:
            result = analyze(target, job.mode, job.sensitivity, progress)
            result["separation"] = {"enabled": False, "mode": "none", "notes_source": "original", "chords_source": "original", "stems": []}
        if job.legacy_source:
            result.setdefault("warnings", []).append("这条旧记录只保留了较低采样率或单声道音轨。重新上传原文件可保留更多分离所需的声音细节。")
        progress(98, "保存本地结果")
        result["processing"] = {"total_seconds": round(time.monotonic() - started, 3),
                                "preparation_seconds": round(prepared_at - started, 3),
                                "reused_stems": bool(reused)}
        with lock:
            result.update({"id": job.id, "name": job.name, "created": job.created, "revision": 0,
                           "clip_start": job.clip_start + job.source_offset, "parent_id": job.parent_id, "legacy_source": job.legacy_source})
            result["score_settings"] = defaults(result)
            job.result = result
            save_result(job)
            job.status, job.progress, job.stage = "done", 100, "分析完成"
    except InterruptedError:
        with lock:
            job.status, job.stage = "cancelled", "分析已取消"
        shutil.rmtree(job.folder, ignore_errors=True)
    except Exception as exc:
        logging.exception("Analysis failed for job %s", job.id)
        with lock:
            job.status = "error"
            job.error = str(exc) if isinstance(exc, (ValueError, RuntimeError)) else "分析未完成，请查看本地服务日志后重试。"
        shutil.rmtree(job.folder, ignore_errors=True)


def reserve(name: str, mode: str, sensitivity: float) -> Job:
    cleanup()
    with lock:
        if sum(j.status in ("queued", "running") for j in jobs.values()) >= 3:
            raise HTTPException(429, "已有 3 个分析任务，请等待或取消后重试。")
        job = Job(uuid4().hex, name[:180], mode, sensitivity)
        if hosting.enabled():
            job.owner_id = hosting.owner.get()
            if not hosting.valid_owner(job.owner_id):
                raise HTTPException(401, "Missing user session")
            if any(j.owner_id == job.owner_id and j.status in ("queued", "running") for j in jobs.values()):
                raise HTTPException(429, "You already have an active analysis. Please wait for it to finish.")
        job.folder.mkdir(parents=True)
        if job.owner_id:
            (job.folder / "owner.txt").write_text(job.owner_id)
        jobs[job.id] = job
        return job


@app.get("/api/health")
def health():
    from .engines import CHECKPOINT, chord_model, pitch_model
    from .vocal_removal import vocal_model
    from .runtime import model_threads
    return {"status": "ok", "local": not hosting.enabled(), "max_duration": MAX_DURATION, "max_bytes": MAX_BYTES,
            "features": {"note_tracks": True, "solo": True},
            "engines": {"chordmini": CHECKPOINT.is_file(), "basic_pitch": importlib.util.find_spec("basic_pitch") is not None, "demucs": separation_available(), "vocal_removal": vocal_removal_available()},
            "loaded": {"chordmini": bool(chord_model.cache_info().currsize), "basic_pitch": bool(pitch_model.cache_info().currsize), "vocal_removal": bool(vocal_model.cache_info().currsize)},
            "model_threads": model_threads()}


@app.get("/api/catalog")
def get_catalog():
    return catalog()


@app.post("/api/upload-ticket")
def upload_ticket(request: Request):
    if not hosting.enabled():
        return {"direct": False}
    origin = request.headers.get("x-fretflow-origin")
    if not hosting.allowed_origin(origin):
        raise HTTPException(403, "Origin not allowed")
    return {"direct": True, "ticket": hosting.signed_ticket(hosting.owner.get(), origin),
            "max_bytes": MAX_BYTES, "max_duration": MAX_DURATION}


@app.get("/api/jobs/{id}/download-ticket")
def download_ticket(id: str, request: Request):
    get_job(id)
    path = request.headers.get("x-fretflow-download-path", "")
    import re
    if not re.fullmatch(rf"/api/jobs/{id}/(?:audio|stems/(?:guitar|vocals|drums|bass|piano|other|instrumental)|export/(?:json|chords\.csv|chords\.txt|notes\.mid|chords\.mid|score\.musicxml|source\.mp3))", path):
        raise HTTPException(400, "Invalid download path")
    origin = request.headers.get("x-fretflow-origin")
    if not hosting.allowed_origin(origin):
        raise HTTPException(403, "Origin not allowed")
    return {"ticket": hosting.signed_ticket(hosting.owner.get(), origin, path, "GET")}


@app.post("/api/analyze", status_code=202)
async def upload(file: UploadFile = File(...), mode: Literal["both", "chords", "notes", "solo"] = Form("chords"),
                 sensitivity: float = Form(.5, ge=.2, le=.8),
                 separation: Literal["none", "guitar", "instrumental"] = Form("none"),
                 clip_start: float = Form(0, ge=0, le=86400), clip_end: float | None = Form(None, gt=0, le=86400)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED:
        await file.close()
        raise HTTPException(415, "请选择 MP4、MOV、WebM、MKV、AVI 等视频，或 MP3、WAV、M4A、FLAC 等音频。")
    if clip_end is not None and (clip_end <= clip_start or clip_end - clip_start > MAX_DURATION):
        await file.close()
        raise HTTPException(422, "Clip exceeds the server duration limit. Select a shorter segment.")
    if separation == "guitar" and not separation_available():
        await file.close()
        raise HTTPException(503, SETUP_MESSAGE)
    if separation == "instrumental" and not vocal_removal_available():
        await file.close()
        raise HTTPException(503, VOCAL_SETUP_MESSAGE)
    job = reserve(Path(file.filename or "音频").name, mode, sensitivity)
    job.separation = separation
    job.clip_start, job.clip_end = clip_start, clip_end
    source = job.folder / ("input" + suffix)
    try:
        size = 0
        with source.open("wb") as stream:
            while chunk := await file.read(1024*1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "File exceeds the server upload limit. Please trim it first.")
                stream.write(chunk)
        if not size:
            raise HTTPException(400, "音频文件为空")
    except BaseException:
        with lock:
            jobs.pop(job.id, None)
        shutil.rmtree(job.folder, ignore_errors=True)
        raise
    finally:
        await file.close()
    queue_job(job, source)
    return {"id": job.id}


class DemoRequest(BaseModel):
    sample: Literal["harmony", "melody"] = "harmony"
    mode: Literal["both", "chords", "notes", "solo"] = "chords"
    sensitivity: float = Field(.5, ge=.2, le=.8)


@app.post("/api/demo", status_code=202)
def demo(data: DemoRequest):
    job = reserve("暖弦 · 和弦示例.wav" if data.sample == "harmony" else "小径 · 单音示例.wav", data.mode, data.sensitivity)
    target = job.folder / "audio.wav"
    sf.write(target, make_demo(data.sample), SR)
    queue_job(job, target)
    return {"id": job.id}


@app.get("/api/jobs")
def history():
    cleanup()
    with lock:
        return [{"id": j.id, "name": j.name, "created": j.created, "status": j.status, "mode": j.mode,
                 "separation": j.result.get("separation", {}).get("mode", j.separation)}
                for j in sorted(jobs.values(), key=lambda j: j.created, reverse=True)
                if j.status == "done" and (not hosting.enabled() or j.owner_id == hosting.owner.get())][:12]


@app.get("/api/jobs/{id}")
def status(id: str):
    with lock:
        job = get_job(id)
        return {"id": job.id, "status": job.status, "progress": job.progress, "stage": job.stage,
                "error": job.error, "result": deepcopy(job.result) if job.status == "done" else None}


@app.delete("/api/jobs/{id}")
def cancel(id: str):
    with lock:
        job = get_job(id)
        job.cancel.set()
        (job.folder / "pending.json").unlink(missing_ok=True)
        if job.status not in ("running", "queued"):
            jobs.pop(id)
            shutil.rmtree(job.folder, ignore_errors=True)
    return {"ok": True}


@app.get("/api/jobs/{id}/audio")
def audio(id: str):
    job = get_job(id)
    if job.status != "done":
        raise HTTPException(409, "分析尚未完成")
    return FileResponse(job.folder / "audio.wav", media_type="audio/wav")


@app.get("/api/jobs/{id}/stems/{stem}")
def stem_audio(id: str, stem: str):
    job = get_job(id)
    if job.status != "done":
        raise HTTPException(409, "分析尚未完成")
    if stem not in (*STEMS, "instrumental") or not job.result or stem not in job.result.get("separation", {}).get("stems", []):
        raise HTTPException(404, "这个分析没有所选声部。")
    target = job.folder / "stems" / f"{stem}.wav"
    if not target.is_file():
        raise HTTPException(404, "声部文件已过期或不存在。")
    return FileResponse(target, media_type="audio/wav", filename=f"fretflow-{id[:8]}-{stem}.wav")


class ReanalyzeRequest(BaseModel):
    separation: Literal["none", "instrumental", "guitar"] = "instrumental"
    mode: Literal["both", "chords", "notes", "solo"] | None = None


@app.post("/api/jobs/{id}/reanalyze", status_code=202)
def reanalyze(id: str, data: ReanalyzeRequest):
    if data.separation == "instrumental" and not vocal_removal_available():
        raise HTTPException(503, VOCAL_SETUP_MESSAGE)
    if data.separation == "guitar" and not separation_available():
        raise HTTPException(503, SETUP_MESSAGE)
    with lock:
        original = get_job(id)
        if original.status != "done" or original.result is None:
            raise HTTPException(409, "分析尚未完成")
        job = reserve(original.name, data.mode or original.mode, original.sensitivity)
        job.separation, job.parent_id = data.separation, id
        # The saved audio is already trimmed. Preserve its source offset without
        # applying that trim again; never reprocess a previously isolated stem.
        job.source_offset = original.result.get("clip_start", 0.)
        source = original.folder / "audio.wav"
        target = job.folder / "input.wav"
        try:
            info = sf.info(source)
            job.legacy_source = original.legacy_source or info.samplerate < 44100 or info.channels < 2
            shutil.copyfile(source, target)
            # A new draft of the same recording can reuse identical, completed
            # stems. Copy within the owner-checked transaction so TTL cleanup or
            # later edits on the parent cannot change this job's inputs.
            previous = original.result.get("separation", {})
            if data.separation != "none" and previous.get("mode") == data.separation and not job.legacy_source:
                stems = previous.get("stems", [])
                expected = ["instrumental", "vocals"] if data.separation == "instrumental" else list(STEMS)
                if set(stems) == set(expected) and all((original.folder / "stems" / f"{stem}.wav").is_file() for stem in stems):
                    (job.folder / "stems").mkdir()
                    for stem in stems:
                        shutil.copyfile(original.folder / "stems" / f"{stem}.wav", job.folder / "stems" / f"{stem}.wav")
                    (job.folder / "prepared-stems.json").write_text(json.dumps({**previous, "reused": True, "seconds": 0.}))
        except (OSError, RuntimeError) as exc:
            jobs.pop(job.id, None)
            shutil.rmtree(job.folder, ignore_errors=True)
            raise HTTPException(409, "原音轨已过期，请重新上传文件。") from exc
    queue_job(job, target)
    return {"id": job.id}


class ChordEdit(BaseModel):
    index: int = Field(ge=0)
    raw: str = Field(max_length=30)


class KeyEdit(BaseModel):
    root: int = Field(ge=0, le=11)
    mode: Literal["major", "minor"]


class ScoreSettings(BaseModel):
    bpm: float = Field(ge=30, le=240)
    meter: Literal["3/4", "4/4"] = "4/4"
    offset: float = Field(0, ge=0, le=180)
    capo: int = Field(0, ge=0, le=12)
    tuning: Literal["standard", "drop-d"] = "standard"
    fret_min: int = Field(5, ge=0, le=21)
    fret_max: int = Field(12, ge=0, le=21)

    @model_validator(mode="after")
    def ordered_fret_range(self):
        if self.fret_min > self.fret_max:
            raise ValueError("The minimum fret must not exceed the maximum fret.")
        return self


class NoteEdit(BaseModel):
    index: int | None = Field(None, ge=0)
    midi: int = Field(ge=0, le=127)
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    excluded: bool = False
    track: Literal[1, 2] | None = None


class NoteTracks(BaseModel):
    indices: list[int] = Field(min_length=1, max_length=1000)
    track: Literal[1, 2]


class Edits(BaseModel):
    revision: int = Field(ge=0)
    chord: ChordEdit | None = None
    key: KeyEdit | None = None
    note: NoteEdit | None = None
    note_tracks: NoteTracks | None = None
    score_settings: ScoreSettings | None = None


@app.patch("/api/jobs/{id}")
def edit(id: str, data: Edits):
    with lock:
        job = get_job(id)
        if job.status != "done" or job.result is None:
            raise HTTPException(409, "分析尚未完成")
        if data.revision != job.result["revision"]:
            raise HTTPException(409, "结果已在另一窗口修改，请重新打开此记录。")
        result = deepcopy(job.result)
        if data.chord:
            if data.chord.index >= len(result["chords"]):
                raise HTTPException(422, "和弦片段不存在")
            try:
                info = chord_info(data.chord.raw)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            result["chords"][data.chord.index].update({**info, "edited": data.chord.raw != result["chords"][data.chord.index]["original_raw"], "review": False})
        if data.key:
            root, mode = data.key.root, data.key.mode
            result["key"].update({"root": root, "mode": mode, "label": f"{PITCHES[root]} {'大调' if mode == 'major' else '小调'}", "edited": True, "ambiguous": False})
        if data.score_settings:
            if data.score_settings.offset >= result["duration"]:
                raise HTTPException(422, "第一拍偏移须小于片段时长。")
            result["score_settings"] = data.score_settings.model_dump()
        if data.note:
            note = data.note
            if note.end <= note.start or note.end > result["duration"]:
                raise HTTPException(422, "音符结束须晚于开始，且在片段时长以内。")
            updated = {"midi": note.midi, "name": f"{PITCHES[note.midi % 12]}{note.midi // 12 - 1}",
                       "start": note.start, "end": note.end, "excluded": note.excluded, "edited": True}
            if note.track is not None:
                updated["track"] = note.track
            if note.index is None:
                result["notes"].append({**updated, "activation": 1., "bends": [], "added": True})
            elif note.index < len(result["notes"]):
                original = result["notes"][note.index]
                updated["original"] = original.get("original", {k: original[k] for k in ("start", "end", "midi")})
                original.update(updated)
            else:
                raise HTTPException(422, "音符不存在。")
        if data.note_tracks:
            indices = data.note_tracks.indices
            if any(index < 0 or index >= len(result["notes"]) for index in indices):
                raise HTTPException(422, "Note selection is no longer valid. Reopen the record.")
            for index in set(indices):
                result["notes"][index]["track"] = data.note_tracks.track
                result["notes"][index]["track_edited"] = True
        result["revision"] += 1
        job.result = enrich(result)
        save_result(job)
        return deepcopy(job.result)


@app.get("/api/jobs/{id}/score")
def score(id: str):
    with lock:
        job = get_job(id)
        if not job.result or job.status != "done":
            raise HTTPException(409, "分析尚未完成")
        return build_score(deepcopy(job.result))


@app.get("/api/jobs/{id}/export/{kind}")
def export(id: str, kind: Literal["json", "chords.csv", "chords.txt", "notes.mid", "chords.mid", "score.musicxml", "source.mp3"]):
    with lock:
        job = get_job(id)
        if job.result is None or job.status != "done":
            raise HTTPException(409, "结果尚未就绪")
        result = deepcopy(job.result)
    if kind == "json":
        content = json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8")
        mime = "application/json"
    elif kind == "score.musicxml":
        content, mime = build_score(result)["musicxml"].encode(), "application/vnd.recordare.musicxml+xml"
    elif kind == "source.mp3":
        output = job.folder / "audio.mp3"
        if not output.is_file():
            try:
                # Each writer has its own output; atomically publish on completion.
                temporary = job.folder / f"{uuid4().hex}.mp3"
                subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(job.folder / "audio.wav"),
                                "-codec:a", "libmp3lame", "-q:a", "2", "-y", str(temporary)], check=True, capture_output=True, timeout=30)
                temporary.replace(output)
            except (OSError, subprocess.SubprocessError) as exc:
                temporary.unlink(missing_ok=True)
                raise HTTPException(503, "MP3 导出失败，请重试。") from exc
        return FileResponse(output, media_type="audio/mpeg", filename=f"fretflow-{id[:8]}.mp3")
    elif kind == "chords.txt":
        content, mime = chord_chart(result).encode("utf-8"), "text/plain"
    elif kind == "chords.csv":
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["start_seconds", "end_seconds", "chord", "roman", "function", "original_model_label", "edited", "review", "status"])
        for chord in result["chords"]:
            writer.writerow([chord["start"], chord["end"], chord["label"], chord["roman"], chord["function"], chord["original_raw"], chord["edited"], chord.get("review", False), chord_status(chord)])
        content, mime = stream.getvalue().encode("utf-8-sig"), "text/csv"
    else:
        import pretty_midi
        midi = pretty_midi.PrettyMIDI()
        instrument = pretty_midi.Instrument(program=24, name="Beta - notes may be inaccurate; reference only" if kind == "notes.mid" else "Chord guide - theoretical voicing")
        if kind == "notes.mid":
            if not result["notes"]:
                raise HTTPException(422, "没有可导出的音符")
            instruments = {}
            for note in result["notes"]:
                if note.get("excluded"):
                    continue
                track = note.get("track", 1)
                if track not in instruments:
                    instruments[track] = pretty_midi.Instrument(program=24, name=f"Guitar {track} - Beta; reference only")
                if result.get("mode") == "solo":
                    # Solo activation is pYIN voicing probability, not playing
                    # intensity. Match the web performance player's neutral
                    # velocity unless an explicit MIDI velocity was supplied.
                    explicit = note.get("velocity")
                    velocity = max(1, min(127, math.floor(explicit + .5))) if type(explicit) in (int, float) and math.isfinite(explicit) else 95
                else:
                    velocity = max(1, min(127, round(note["activation"] * 127)))
                instruments[track].notes.append(pretty_midi.Note(velocity, note["midi"], note["start"], note["end"]))
            midi.instruments.extend(instruments[track] for track in sorted(instruments))
        else:
            for chord in result["chords"]:
                if chord["root"] is None:
                    continue
                for interval in QUALITIES[chord["quality"]][1]:
                    instrument.notes.append(pretty_midi.Note(85, 48 + chord["root"] + interval, chord["start"], chord["end"]))
                if chord.get("bass"):
                    instrument.notes.append(pretty_midi.Note(85, 36+PITCHES.index(chord["bass"]), chord["start"], chord["end"]))
            if not instrument.notes:
                raise HTTPException(422, "没有可导出的和弦")
        if kind != "notes.mid":
            midi.instruments.append(instrument)
        output = io.BytesIO()
        midi.write(output)
        content, mime = output.getvalue(), "audio/midi"
    return Response(content, media_type=mime, headers={"Content-Disposition": f'attachment; filename="fretflow-{id[:8]}-{kind}"'})
