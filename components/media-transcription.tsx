"use client";

import { ToneGuide } from "./tone-guide";
import { TestFeedback } from "./test-feedback";

import { useLanguage, LanguageSwitcher } from "./language-provider";

import { useEffect, useRef, useState } from "react";
import { NotationScore } from "./notation-score";
import { NoteAttackReview } from "./note-attack-review";
import { TranscriptionExports } from "./transcription-exports";
import { prepareMediaUpload, validateClip, type UploadProgress } from "@/lib/media-upload";
import { api, seconds, TRANSCRIPTION_API, NOTATION_BETA_NOTICE, type AnalysisMode, type DetectedNote, type Job, type ScoreDraft, type Transcription, type Stem } from "@/lib/transcription";

const extensions = ".mp4,.mov,.m4v,.mkv,.avi,.webm,.mpeg,.mpg,.3gp,.mp3,.wav,.m4a,.aac,.ogg,.flac,.aiff,.aif";
const pitches = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitchName = (midi: number) => `${pitches[midi % 12]}${Math.floor(midi / 12) - 1}`;
const stemLabels: Record<Stem, string> = { instrumental: "Accompaniment · vocals removed", guitar: "Guitar", vocals: "Vocals", drums: "Drums", bass: "Bass", piano: "Piano", other: "Other instruments" };

export function MediaTranscription({ open, onClose, onPractice }: {
  open: boolean; onClose: () => void; onPractice: (result: Transcription) => void;
}) {
  const { t, localize } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLAudioElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultView = useRef<HTMLDivElement>(null);
  const chordsView = useRef<HTMLElement>(null);
  const scoreView = useRef<HTMLElement>(null);
  const notesView = useRef<HTMLDetailsElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [upload, setUpload] = useState<UploadProgress | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [clipStart, setClipStart] = useState("0");
  const [clipEnd, setClipEnd] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("chords");
  const [separation, setSeparation] = useState("instrumental");
  const [separationReady, setSeparationReady] = useState(false);
  const [vocalsReady, setVocalsReady] = useState(false);
  const [tracksReady, setTracksReady] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<number[]>([]);
  const [listenSource, setListenSource] = useState<"original" | Stem>("original");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [audioPlayToken, setAudioPlayToken] = useState(0);
  const [toneStopToken, setToneStopToken] = useState(0);
  const resumePlayback = useRef<{ time: number; playing: boolean } | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobId, setJobId] = useState("");
  const [poll, setPoll] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Transcription | null>(null);
  const [score, setScore] = useState<ScoreDraft | null>(null);
  const [catalog, setCatalog] = useState<{ raw: string; label: string }[]>([]);
  const [history, setHistory] = useState<{ id: string; name: string; separation?: string }[]>([]);
  const [limits, setLimits] = useState({ max_bytes: 200 * 1024 * 1024, max_duration: 180 });
  const [hosted, setHosted] = useState(false);
  const [limitsReady, setLimitsReady] = useState(false);
  const [time, setTime] = useState(0);
  const [notePage, setNotePage] = useState(0);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    return () => uploadController.current?.abort();
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fretflow-analysis-mode");
      if (saved === "chords" || saved === "both" || saved === "notes") setMode(saved);
    } catch { /* The default remains usable when browser storage is unavailable. */ }
  }, []);

  function chooseMode(next: AnalysisMode) {
    setMode(next);
    try { localStorage.setItem("fretflow-analysis-mode", next); } catch { /* Keep the choice for this session. */ }
  }

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else {
      dialog.current?.close();
      dialog.current?.querySelectorAll("audio, video").forEach(media => (media as HTMLMediaElement).pause());
      setAudioPlayToken(token => token + 1);
    }
  }, [open]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!open) return;
    setError("");
    setLimitsReady(false);
    void Promise.all([api<typeof catalog>("/catalog"), api<typeof history>("/jobs"), api<{ local: boolean; max_bytes: number; max_duration: number; features?: { note_tracks?: boolean }; engines: { demucs?: boolean; vocal_removal?: boolean } }>("/health")])
      .then(([choices, records, health]) => { setCatalog(choices); setHistory(records); setHosted(health.local === false); setLimits({ max_bytes: health.max_bytes, max_duration: health.max_duration }); setSeparationReady(health.engines.demucs === true); setVocalsReady(health.engines.vocal_removal === true); setTracksReady(health.features?.note_tracks === true); setLimitsReady(true); })
      .catch((e) => setError(e.message));
  }, [open, result?.id]);
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const next = await api<Job>(`/jobs/${jobId}`);
        if (cancelled) return;
        setJob(next);
        if (next.status === "done" && next.result) {
          setResult(next.result); setBusy(false); setError(""); setNotePage(0); setSelectedNotes([]); setLoop(null); setTime(0);
          setListenSource(next.result.separation?.notes_source || "original"); resumePlayback.current = null;
        } else if (["error", "cancelled"].includes(next.status)) {
          setBusy(false); setError(next.error || "Analysis cancelled.");
        } else { setBusy(true); timer = setTimeout(check, 1000); }
      } catch (e) { if (!cancelled) { setBusy(false); setError((e as Error).message); } }
    }
    void check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [jobId, poll]);
  useEffect(() => {
    setScore(null);
    if (!result || !open || !result.notes.some((n) => !n.excluded)) return;
    let cancelled = false;
    void api<ScoreDraft>(`/jobs/${result.id}/score`).then((data) => { if (!cancelled) setScore(data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [result, open]);

  useEffect(() => {
    if (!result?.id || !open) return;
    const frame = requestAnimationFrame(() => resultView.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [result?.id, open]);

  function chooseFile(next: File | null) {
    if (busy || !next) return;
    if (!extensions.split(",").includes("." + next.name.split(".").pop()?.toLowerCase())) { setError("Choose a supported video or audio format."); return; }
    if (next.size > limits.max_bytes) { setError("File exceeds the server upload limit. Please trim it first."); return; }
    setFile(next); setMediaDuration(null); setUpload(null); setClipStart("0"); setClipEnd(""); setError("");
  }

  async function start(sample?: string) {
    if (busy || !limitsReady) return;
    if (!sample && !file) { input.current?.click(); return; }
    const a = Number(clipStart), b = clipEnd === "" ? null : Number(clipEnd);
    try { if (!sample) validateClip(a, b, mediaDuration, limits.max_duration); }
    catch (error) { setError((error as Error).message); return; }
    setBusy(true); setError(""); setResult(null); setScore(null); setJob(null); setJobId(""); player.current?.pause();
    dialog.current?.querySelectorAll("audio, video").forEach(media => (media as HTMLMediaElement).pause());
    const controller = new AbortController(); uploadController.current = controller;
    setUpload(sample ? null : { stage: "preparing", loaded: 0, total: 1, originalBytes: file!.size, bytesPerSecond: 0 });
    const analysisMode = sample === "melody" ? "notes" : mode;
    if (sample === "melody") chooseMode("notes");
    try {
      let response: { id: string };
      if (sample) response = await api("/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample, mode: analysisMode }) });
      else {
        const prepared = await prepareMediaUpload(file!, {
          start: a, end: b, maxDuration: limits.max_duration, maxBytes: limits.max_bytes,
          duration: mediaDuration, signal: controller.signal,
          onProgress: fraction => setUpload({ stage: "preparing", loaded: fraction, total: 1, originalBytes: file!.size, bytesPerSecond: 0 }),
        });
        setUpload({ stage: "authorizing", loaded: 0, total: prepared.size, originalBytes: file!.size, bytesPerSecond: 0 });
        const form = new FormData(); form.append("file", prepared); form.append("mode", mode); form.append("clip_start", String(a)); form.append("separation", separation);
        if (b !== null) form.append("clip_end", String(b));
        response = await api("/analyze", { method: "POST", body: form, signal: controller.signal }, { originalBytes: file!.size, onProgress: setUpload });
      }
      setUpload(null); setJobId(response.id);
    } catch (e) { setBusy(false); setUpload(null); if (!controller.signal.aborted) setError((e as Error).message); }
    finally { if (uploadController.current === controller) uploadController.current = null; }
  }

  async function reanalyze() {
    if (!result || busy || saving) return;
    setBusy(true); setError(""); player.current?.pause();
    try {
      const next = await api<{ id: string }>(`/jobs/${result.id}/reanalyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ separation, mode })
      });
      setResult(null); setScore(null); setJob(null); setJobId(next.id);
    } catch (e) { setBusy(false); setError((e as Error).message); }
  }

  async function patch(values: object) {
    if (!result || saving) return;
    setSaving(true); setError("");
    try {
      const next = await api<Transcription>(`/jobs/${result.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: result.revision, ...values }) });
      setResult(next); setSelectedNotes([]);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  function seek(start: number, end?: number) {
    if (!player.current) return;
    player.current.currentTime = start; setTime(start);
    setLoop(end === undefined ? null : { start, end });
    void player.current.play().catch(() => setError("Press Play in the original audio player."));
  }

  function switchSource(source: "original" | Stem) {
    if (source === listenSource) return;
    if (player.current) {
      resumePlayback.current = { time: player.current.currentTime, playing: !player.current.paused };
      player.current.pause();
    }
    setListenSource(source);
  }

  const video = file && (file.type.startsWith("video/") || /\.(mp4|mov|m4v|mkv|avi|webm|mpeg|mpg|3gp)$/i.test(file.name));
  const download = (kind: string) => `${TRANSCRIPTION_API}/jobs/${result?.id}/export/${kind}`;
  const activeChord = result?.chords.findIndex((chord) => chord.start <= time && time < chord.end);
  const playbackUrl = result ? `${TRANSCRIPTION_API}/jobs/${result.id}/${listenSource === "original" ? "audio" : `stems/${listenSource}`}` : "";
  const hasNotation = result && (result.mode === "notes" || result.mode === "both" || result.notes.length > 0);

  return <dialog ref={dialog} className="transcription-dialog" aria-labelledby="transcription-title" onCancel={onClose}>
    <header className="transcription-header">
      <div><span>FretFlow / {t("Video to chords")}</span><h2 id="transcription-title">{t("Hear something you love. Make it your own.")}</h2></div>
      <div className="transcription-header-actions"><LanguageSwitcher /><button className="soft-button" onClick={onClose} aria-label={t("Close transcription")}>{t("Back to guitar")}</button></div>
    </header>
    {open && <div className="transcription-body">
      <TestFeedback />
      <div className="transcription-intro"><p className="transcription-lead">{t("A video. Your next practice session.")}<span>{t("Start with the harmony, check it against the recording, and make the performance your own.")}</span></p><ol className="transcription-journey" aria-label={t("Transcription steps")}><li><b>01</b> {t("Import a clip")}</li><li><b>02</b> {t("Listen & refine")}</li><li><b>03</b> {t("Export & practice")}</li></ol></div>
      <section className="transcription-import" aria-label={t("Media import")}>
        <div className="media-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files[0]); }}>
          {preview && video ? <video key={preview} className="media-thumbnail" src={preview} controls muted playsInline preload="metadata" onLoadedMetadata={e => setMediaDuration(e.currentTarget.duration)} aria-label={t("Imported video preview")} /> : <div className="media-wave" aria-hidden="true">{[14,28,42,24,52,34,60,38,22,44,30,16].map((height, index) => <i key={index} style={{ height }} />)}</div>}
          <input ref={input} type="file" id="media-file" accept={extensions} disabled={busy} onChange={(e) => { chooseFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          <label htmlFor="media-file"><strong>{file?.name || t("Drop a video or audio file")}</strong><span>{t("or click to choose a file")}</span></label>
          <small>{t("MP4 · MOV · WebM · MKV · AVI · MP3 · WAV · M4A · FLAC and more")}<br />{t("{size} MiB per file; analyze up to {seconds} seconds at a time", { size: Math.floor(limits.max_bytes / 1024 / 1024), seconds: limits.max_duration })}</small>
          {hosted && <small>{t("Media and results are kept for 24 hours and linked to this browser. Export anything you want to keep.")}</small>}
        </div>
        <div className="media-options">
          <label>{t("What would you like to learn?")}<select value={mode} onChange={(e) => chooseMode(e.target.value as AnalysisMode)} disabled={busy} aria-describedby="analysis-mode-help">
            <option value="chords">{t("Chord chart · recommended")}</option><option value="both">{t("Chord chart + staff / tabs (Beta)")}</option><option value="notes">{t("Staff / tabs only (Beta)")}</option>
          </select></label>
          <div className="transcription-recommendation" id="analysis-mode-help"><strong>{t(mode === "chords" ? "Recommended for playing your own version" : "Note-by-note study · Beta")}</strong><p>{t(mode === "chords" ? "Learn the chord changes and their timing, then choose your own voicings, picking patterns and fills. Your output preference is saved on this browser." : NOTATION_BETA_NOTICE)}</p></div>
          <label>{t("Audio preparation")}<select value={separation} onChange={(e) => setSeparation(e.target.value)} disabled={busy}>
            <option value="none">{t("Original audio · solo instrument")}</option>
            <option value="instrumental" disabled={!vocalsReady}>{t("Remove vocals · keep accompaniment (recommended)")}</option>
            <option value="guitar" disabled={!separationReady}>{t("Isolate guitar · full mix (Beta)")}</option>
          </select></label>
          <small className="transcription-hint">{t(separation === "instrumental" ? "Remove singing and speech before analyzing chords and notes. Other instruments remain; separation takes extra time." : separation === "guitar" ? "Notes use the guitar stem; chords use the full mix. Separation takes extra time and can lose quiet notes." : "Use original audio for a clean guitar recording.")}{separation === "guitar" && !separationReady && <> {t("Guitar separation is not available on this analysis service yet.")}</>}{separation === "instrumental" && !vocalsReady && <> {t("Vocal removal is not available on this analysis service yet.")}</>}</small>
          <details className="media-range"><summary>{t("Trim clip")} <span>{clipStart === "0" && clipEnd === "" ? t("Full file by default") : `${clipStart}s — ${clipEnd || t("end")}`}</span></summary><div className="media-clip"><label>{t("Start time (seconds)")}<input type="number" min="0" step="0.1" value={clipStart} onChange={(e) => setClipStart(e.target.value)} disabled={busy} /></label>
            <label>{t("End time (seconds)")}<input type="number" min="0" step="0.1" placeholder={t("End of file")} value={clipEnd} onChange={(e) => setClipEnd(e.target.value)} disabled={busy} /></label></div></details>
          <p className="transcription-hint">{t("Two guitars in one recording? Guitar isolation keeps them in one stem. Assign notes to Guitar 1 and Guitar 2 after analysis for separate score exports; automatic separation of two guitars is not available.")}</p>
          <button className="transcription-primary" onClick={() => void start()} disabled={busy || !limitsReady || (separation === "instrumental" && !vocalsReady) || (separation === "guitar" && !separationReady)}>{busy ? (upload ? t(upload.stage === "preparing" ? "Preparing audio…" : "Uploading file…") : t("Analyzing…")) : t("Start analysis")}</button>
          <div className="transcription-actions"><button disabled={busy} onClick={() => void start("harmony")}>{t("Try chord demo")}</button><button disabled={busy} onClick={() => void start("melody")}>{t("Try melody demo (Beta)")}</button></div>
        </div>
      </section>
      <p className="transcription-hint">{t("Save TikTok or Douyin videos as files before importing. Share links are not supported yet. Audio is extracted directly; no MP3 conversion needed.")}</p>
      {preview && !video && <details className="source-preview"><summary>{t("Preview imported audio")}</summary><audio key={preview} src={preview} controls preload="metadata" onLoadedMetadata={e => setMediaDuration(e.currentTarget.duration)} /><small>{t("Formats your browser cannot preview may still work with the analysis service.")}</small></details>}
      {(busy || job?.status === "cancelled") && <div className="transcription-progress" role="status"><span>{job?.stage ? localize(job.stage) : upload ? t(upload.stage === "preparing" ? "Preparing audio…" : upload.stage === "authorizing" ? "Connecting to upload service…" : upload.stage === "waiting" ? "Upload complete · waiting for the server…" : "Uploading file…") : t("Starting analysis…")}
        {upload?.stage === "uploading" && <> {Math.min(100, Math.round(upload.loaded / Math.max(upload.total, 1) * 100))}% · {(upload.loaded / 1e6).toFixed(1)} / {(upload.total / 1e6).toFixed(1)} MB · {(upload.bytesPerSecond / 1e6).toFixed(2)} MB/s</>}
        {upload && upload.stage !== "preparing" && upload.total < upload.originalBytes * .95 && <small> {t("Audio only · {percent}% less to upload", { percent: Math.round((1 - upload.total / upload.originalBytes) * 100) })}</small>}
      </span><progress max="100" value={job ? job.progress : upload && ["preparing", "uploading"].includes(upload.stage) ? upload.loaded / Math.max(upload.total, 1) * 100 : undefined} />
        {busy && !jobId && upload && <button onClick={() => uploadController.current?.abort()}>{t("Cancel upload")}</button>}
        {busy && jobId && <button onClick={() => void api(`/jobs/${jobId}`, { method: "DELETE" }).catch((e) => setError(e.message))}>{t("Cancel analysis")}</button>}</div>}
      {error && <div className="transcription-error" role="alert">{localize(error)}{jobId && !busy && <button onClick={() => { setError(""); setPoll((n) => n + 1); }}>{t("Reload result")}</button>}</div>}
      {history.length > 0 && <details className="transcription-history"><summary>{t(hosted ? "Recent records for this browser (kept for 24 hours)" : "Recent local records (kept for 24 hours)")}</summary><div className="transcription-actions">{history.map((item) => <button disabled={busy} key={item.id} onClick={() => { setResult(null); setJobId(item.id); setPoll((n) => n + 1); }}>{localize(item.name)} · {t(item.separation === "instrumental" ? "Accompaniment · vocals removed" : item.separation === "guitar" ? "Guitar" : "Original audio")}</button>)}</div></details>}
      {result && <div className="transcription-result" ref={resultView}>
        <header className="transcription-result-head"><div><span>{t("Analysis draft · listen to verify")}</span><h3>{localize(result.name)}</h3><p>{seconds(result.duration)} · {t(result.chords.length === 1 ? "{count} chord segment" : "{count} chord segments", { count: result.chords.length })} · {t(result.notes.filter(n => !n.excluded).length === 1 ? "{count} note" : "{count} notes", { count: result.notes.filter(n => !n.excluded).length })}</p></div>
          <button className="transcription-primary" disabled={!result.chords.some((c) => c.root !== null)} onClick={() => onPractice(result)}>{t("Practice these chords on the fretboard")}</button></header>
        <nav className="transcription-result-nav" aria-label={t("Analysis result navigation")}>{result.chords.length > 0 && <button onClick={() => chordsView.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t("Chord chart")} <span>{result.chords.length}</span></button>}{hasNotation && <button onClick={() => scoreView.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t("Staff / tabs (Beta)")} <span>↗</span></button>}<small>{t("Listen to verify the harmony. Make the arrangement your own.")}</small></nav>
        <TranscriptionExports key={result.id} result={result} score={score} saving={saving} />
        <section className="transcription-playback" aria-label={t("Compare audio tracks")}>
          <div className="transcription-actions"><button disabled={busy || saving || (separation === "instrumental" && !vocalsReady) || (separation === "guitar" && !separationReady)} onClick={() => void reanalyze()}>{t("Reanalyze with selected options")}</button>
            {result.parent_id && <button disabled={busy} onClick={() => { setResult(null); setJobId(result.parent_id!); setPoll((n) => n + 1); }}>{t("Open previous analysis")}</button>}
          </div>
          <small>{t("Reanalysis creates a new draft and keeps your previous edits.")}</small>
          <label>{t("Clip audio · starting at {time} in the source file", { time: seconds(result.clip_start || 0) })}</label>
          {result.separation?.enabled && <><label>{t("Listen to")}<select aria-label={t("Listen to")} value={listenSource} onChange={(e) => switchSource(e.target.value as "original" | Stem)}><option value="original">{t("Original audio")}</option>{result.separation.stems.map((stem) => <option key={stem} value={stem}>{t(stemLabels[stem])}</option>)}</select></label><small>{t(result.separation.notes_source === "instrumental" ? "Chords and notes use the accompaniment. Switch to original audio or vocals to compare at the same position." : "Notes use the guitar stem. Switch tracks to compare at the same position.")}</small></>}
          <audio ref={player} key={result.id} src={playbackUrl} controls onPlay={() => { setAudioPlayToken(token => token + 1); setToneStopToken(token => token + 1); }} onLoadedMetadata={(e) => { const audio = e.currentTarget; audio.playbackRate = playbackSpeed; const resume = resumePlayback.current; resumePlayback.current = null; if (resume) { audio.currentTime = Math.min(resume.time, Math.max(0, audio.duration - .01)); if (resume.playing) void audio.play().catch(() => setError("请点击原音播放器的播放按钮。")); } }} onTimeUpdate={(e) => { const audio = e.currentTarget; if (loop && audio.currentTime >= loop.end) audio.currentTime = loop.start; setTime(audio.currentTime); }} onEnded={() => { if (loop && player.current) { player.current.currentTime = loop.start; void player.current.play(); } }} />
          <div className="transcription-actions"><label>{t("Playback speed")}<select value={playbackSpeed} onChange={(e) => { const speed = Number(e.target.value); setPlaybackSpeed(speed); if (player.current) player.current.playbackRate = speed; }}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option></select></label>
            {listenSource !== "original" && <a href={playbackUrl} download>{t("Download selected stem WAV")}</a>}
            {loop && <button onClick={() => setLoop(null)}>{t("Stop loop")} {seconds(loop.start)}–{seconds(loop.end)}</button>}
            <a href={download("source.mp3")} download>{t("Download clip MP3")}</a><a href={download("json")} download>{t("Save analysis data")}</a>
          </div>
        </section>
        {hasNotation && result.notes.length > 0 && <NoteAttackReview key={result.id} notes={result.notes} duration={result.duration} onSeek={seek} onEdit={index => {
          setNotePage(Math.floor(index / 20));
          if (notesView.current) {
            notesView.current.open = true;
            requestAnimationFrame(() => notesView.current?.querySelector(`[data-note-index="${index}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
          }
        }} />}
        {open && <details className="tone-guide-details"><summary>{t("Tone starting points")}</summary><ToneGuide stopToken={toneStopToken} onBeforePlay={() => { player.current?.pause(); setAudioPlayToken(token => token + 1); }} /></details>}
        <details className="transcription-caveats"><summary>{t("What to review in this analysis")}</summary>{result.warnings.map((warning) => <p key={warning}>{localize(warning)}</p>)}</details>
        {result.chords.length > 0 && <section className="transcription-chords" ref={chordsView}><header><h3>{t("Chord chart")}</h3><div className="transcription-actions"><a href={download("chords.txt")} download>{t("Download chord chart")}</a><a href={download("chords.csv")} download>{t("Export chord table")}</a></div></header>
          <p className="transcription-accuracy">{t("Automatic chord estimates need listening review. Unclear segments are marked for review; an edited label is not a guarantee of accuracy. Inversions and extended chords may be missed.")}</p>
          <aside className="transcription-recommendation"><strong>{t("Playing recommendation")}</strong><p>{t(result.chords.some(chord => chord.root !== null) ? "After checking the changes, loop a short passage and start with a simple accompaniment. Choose your own voicings, picking patterns and fills. This is a practice suggestion, not the original arrangement." : "No usable harmony was identified. Replay or try a clearer clip before choosing an accompaniment.")}</p></aside>
          <label className="transcription-key">{t("Key")}<select aria-label={t("Analysis key")} value={result.key.root === null ? "" : `${result.key.root}:${result.key.mode}`} disabled={saving} onChange={(e) => { const [root, mode] = e.target.value.split(":"); void patch({ key: { root: Number(root), mode } }); }}><option value="" disabled>{t("Unknown")}</option>{pitches.flatMap((pitch, root) => ["major", "minor"].map((mode) => <option key={`${root}:${mode}`} value={`${root}:${mode}`}>{pitch} {mode === "major" ? t("major") : t("minor")}</option>))}</select><small>{result.key.ambiguous ? t("Similar key candidates; listen to confirm") : t("Changing the key updates chord degrees")}</small></label>
          <div className="chord-segments">{result.chords.map((chord, index) => <div key={index} className={activeChord === index ? "active" : ""}><button onClick={() => seek(chord.start, chord.end)} aria-label={t("Loop {chord} at {time}", { chord: chord.label, time: seconds(chord.start) })}><small>{seconds(chord.start)}–{seconds(chord.end)}</small><strong>{chord.label}</strong><span>{chord.roman} · {localize(chord.function)}</span></button><select aria-label={t("Edit chord {index}", { index: index + 1 })} value={chord.raw} disabled={saving} onChange={(e) => void patch({ chord: { index, raw: e.target.value } })}>{!catalog.some((c) => c.raw === chord.raw) && <option value={chord.raw}>{chord.label}</option>}{catalog.map((entry) => <option key={entry.raw} value={entry.raw}>{entry.label}</option>)}</select><small>{chord.edited ? t("Edited") : chord.review ? t("Review suggested") : t("Model estimate")}</small></div>)}</div>
        </section>}
        {hasNotation && <section className="transcription-notation" ref={scoreView}><header><div><h3>{t("Staff notation & guitar tabs (Beta)")}</h3><p>{result.tempo?.bpm ? t("Estimated tempo: {bpm} BPM. Time signature defaults to 4/4; adjust to match the performance.", { bpm: result.tempo.bpm }) : t("Tempo is unknown; the draft uses 120 BPM and 4/4. Adjust to match the performance.")}</p></div>{result.notes.some(n => !n.excluded) && <a href={download("score.musicxml")} download>{t("Export MusicXML (Beta)")}</a>}</header>
          <div className="transcription-beta-notice" role="note"><strong>{t("Beta · for reference only")}</strong><p>{t(NOTATION_BETA_NOTICE)}</p></div>
          <details className="score-options"><summary>{t("Adjust score")} <span>{result.score_settings.bpm} BPM · {result.score_settings.meter} · {t("Frets {min}–{max}", { min: result.score_settings.fret_min ?? 5, max: result.score_settings.fret_max ?? 12 })}</span></summary><form key={`settings-${result.revision}`} className="score-settings" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const [fret_min, fret_max] = String(form.get("fretRange")).split(",").map(Number); void patch({ score_settings: { bpm: Number(form.get("bpm")), meter: form.get("meter"), offset: Number(form.get("offset")), capo: Number(form.get("capo")), tuning: form.get("tuning"), fret_min, fret_max } }); }}>
            <label>{t("Tempo (BPM)")}<input name="bpm" type="number" min="30" max="240" step="0.1" defaultValue={result.score_settings.bpm} required /></label>
            <label>{t("Time signature")}<select name="meter" defaultValue={result.score_settings.meter}><option>4/4</option><option>3/4</option></select></label>
            <label>{t("First beat (seconds)")}<input name="offset" type="number" min="0" max={result.duration} step="0.01" defaultValue={result.score_settings.offset} required /></label>
            <label>{t("Capo")}<input name="capo" type="number" min="0" max="12" defaultValue={result.score_settings.capo} required /></label>
            <label>{t("Tuning")}<select name="tuning" defaultValue={result.score_settings.tuning}><option value="standard">{t("Standard E A D G B E")}</option><option value="drop-d">Drop D</option></select></label>
            <label>{t("Preferred fret range")}<select name="fretRange" defaultValue={`${result.score_settings.fret_min ?? 5},${result.score_settings.fret_max ?? 12}`}><option value="0,5">{t("Lower · 0–5")}</option><option value="5,12">{t("Middle · 5–12")}</option><option value="8,17">{t("Higher · 8–17")}</option></select></label>
            <button disabled={saving}>{t("Update score")}</button>
          </form></details>
          {score ? <><div className="score-notices">{score.notices.map((notice) => <p key={notice}>{localize(notice)}</p>)}<small>{t(score.bar_count === 1 ? "{count} bar" : "{count} bars", { count: score.bar_count })} · {t(score.assigned_count === 1 ? "{count} note assigned to tabs" : "{count} notes assigned to tabs", { count: score.assigned_count })}</small></div><NotationScore musicxml={score.musicxml} name={result.name} notes={result.notes} duration={result.duration} audioPosition={time} playbackSpeed={playbackSpeed} audioPlayToken={audioPlayToken} onBeforePlay={() => { player.current?.pause(); setToneStopToken(token => token + 1); }} /></> : <p role="status">{result.notes.some((n) => !n.excluded) ? t("Preparing score…") : result.notes.length ? t("All notes are removed. Restore them below.") : t("No notes were detected. Try a clearer clip or add notes after listening.")}</p>}
        </section>}
        {hasNotation && <details className="transcription-notes" ref={notesView}><summary>{t("Edit notes (Beta)")} · {result.notes.length}</summary><p>{t("Listen to each note, adjust pitch and timing, remove false notes, or add missing ones. Edits also update the score and exports.")}</p>
          <aside className="transcription-recommendation"><strong>{t("Arrange two guitar tracks")}</strong><p>{t("All notes start on Guitar 1. Select notes and assign them by ear. Score, Guitar Pro and MIDI exports keep the tracks separate; the original audio stays mixed.")}</p>
            {tracksReady ? <div className="transcription-actions">
              <button disabled={saving} onClick={() => setSelectedNotes(result.notes.slice(notePage * 20, notePage * 20 + 20).map((_, row) => notePage * 20 + row))}>{t("Select this page")}</button>
              <button disabled={saving || !selectedNotes.length} onClick={() => setSelectedNotes([])}>{t("Clear selection")}</button>
              <span role="status">{t("{count} notes selected", { count: selectedNotes.length })}</span>
              {([1,2] as const).map(track => <button key={track} disabled={saving || !selectedNotes.length} onClick={() => void patch({ note_tracks: { indices: selectedNotes, track } })}>{t("Assign to Guitar {number}", { number: track })}</button>)}
            </div> : <p>{t("This analysis service needs an update before guitar track assignments can be saved.")}</p>}
            <small>{t("Guitar 1: {first} notes · Guitar 2: {second} notes", { first: result.notes.filter(n => !n.excluded && (n.track ?? 1) === 1).length, second: result.notes.filter(n => !n.excluded && n.track === 2).length })}</small>
          </aside>
          <div className="transcription-actions"><a href={download("notes.mid")} download>{t("MIDI (notes · Beta)")}</a><button disabled={saving} onClick={() => void patch({ note: { midi: 60, start: Math.min(time, result.duration - .1), end: Math.min(result.duration, time + .25) } })}>{t("Add C4 at playhead")}</button></div>
          <div className="note-editor">{result.notes.slice(notePage * 20, notePage * 20 + 20).map((note, row) => <NoteRow key={`${notePage * 20 + row}-${result.revision}`} note={note} index={notePage * 20 + row} saving={saving} duration={result.duration} tracksReady={tracksReady} selected={selectedNotes.includes(notePage * 20 + row)} onSelect={checked => setSelectedNotes(previous => checked ? [...previous, notePage * 20 + row] : previous.filter(index => index !== notePage * 20 + row))} onSeek={seek} onSave={(value) => void patch({ note: value })} />)}</div>
          <div className="transcription-actions"><button disabled={notePage === 0} onClick={() => setNotePage((n) => n - 1)}>{t("Previous page")}</button><span>{notePage + 1} / {Math.max(1, Math.ceil(result.notes.length / 20))}</span><button disabled={(notePage + 1) * 20 >= result.notes.length} onClick={() => setNotePage((n) => n + 1)}>{t("Next page")}</button></div>
        </details>}
      </div>}
    </div>}
  </dialog>;
}

function NoteRow({ note, index, saving, duration, tracksReady, selected, onSelect, onSeek, onSave }: {
  note: DetectedNote; index: number; saving: boolean; duration: number; tracksReady: boolean; selected: boolean; onSelect: (checked: boolean) => void;
  onSeek: (start: number, end?: number) => void; onSave: (data: object) => void;
}) {
  const { t, localize } = useLanguage();
  return <form className={`note-row ${note.excluded ? "excluded" : ""}`} data-note-index={index} onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); onSave({ index, midi: Number(form.get("midi")), start: Number(form.get("start")), end: Number(form.get("end")), excluded: note.excluded || false, ...(tracksReady ? { track: Number(form.get("track")) } : {}) }); }}>
    {tracksReady && <label><input type="checkbox" aria-label={t("Select note {number}", { number: index + 1 })} checked={selected} disabled={saving} onChange={event => onSelect(event.target.checked)} />{t("Select")}</label>}
    <button type="button" onClick={() => onSeek(note.start, note.end)}>{index + 1} · {t("Listen")}</button>
    {tracksReady && <label>{t("Guitar track")}<select name="track" defaultValue={note.track ?? 1}>{([1,2] as const).map(track => <option key={track} value={track}>{t("Guitar {number}", { number: track })}</option>)}</select></label>}
    <label>{t("Pitch")}<select name="midi" defaultValue={note.midi}>{Array.from({ length: 128 }, (_, midi) => <option key={midi} value={midi}>{pitchName(midi)}</option>)}</select></label>
    <label>{t("Start (seconds)")}<input name="start" type="number" min="0" max={duration} step="0.0001" defaultValue={note.start} required /></label>
    <label>{t("End (seconds)")}<input name="end" type="number" min="0.0001" max={duration} step="0.0001" defaultValue={note.end} required /></label>
    <button disabled={saving}>{t("Save")}</button><button disabled={saving} type="button" onClick={() => onSave({ index, midi: note.midi, start: note.start, end: note.end, excluded: !note.excluded })}>{note.excluded ? t("Restore note") : t("Remove false note")}</button>
  </form>;
}
