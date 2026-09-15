"""Local adapters around the unmodified ChordMini and Spotify Basic Pitch models.

ChordMini source remains in vendor/ChordMini with its MIT license. Basic Pitch is
installed from its Apache-2.0 distribution. No third-party inference API is used.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import hashlib
import json
import sys
import numpy as np

from .theory import chord_info, PITCHES

ROOT = Path(__file__).resolve().parent.parent
CHORDMINI = ROOT / "vendor" / "ChordMini"
CHECKPOINT = CHORDMINI / "checkpoints" / "2e1d_model_best.pth"


def verify_model(path: Path, key: str):
    expected = json.loads((ROOT / "models.lock.json").read_text())[key]["sha256"]
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise RuntimeError("模型文件校验失败，请重新运行 scripts/setup.sh。")


@lru_cache(maxsize=1)
def chord_model():
    if not CHECKPOINT.is_file():
        raise RuntimeError("缺少 ChordMini 模型，请运行 scripts/setup.sh 完成安装。")
    verify_model(CHECKPOINT, "chordmini")
    sys.path.insert(0, str(CHORDMINI))
    import torch
    from src.models import load_model
    from src.utils import HParams, idx2voca_chord, extract_model_state_dict

    torch.set_num_threads(2)
    config = HParams.load(str(CHORDMINI / "config" / "ChordMini.yaml"))
    model, mean, std = load_model(str(CHECKPOINT), "ChordNet", config, torch.device("cpu"))
    # Fail on incomplete checkpoints rather than silently use random parameters.
    checkpoint = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)
    model.load_state_dict(extract_model_state_dict(checkpoint), strict=True)
    seq_len = int(checkpoint.get("timestep", 108))
    model.eval()
    return model, mean, std, config, seq_len, idx2voca_chord()


def recognize_chords(path: Path, y: np.ndarray, sr: int, progress) -> list[dict]:
    progress(20, "加载 ChordMini 和弦模型")
    model, mean, std, config, seq_len, vocabulary = chord_model()
    from src.evaluation.utils.common import extract_song_features
    from src.evaluation.utils.inference import predict_sliding_windows
    import librosa

    progress(28, "提取和声特征")
    features, step = extract_song_features(str(path), config)
    progress(38, "ChordMini 正在识别和弦")
    predictions = predict_sliding_windows(
        model, features, mean, std, seq_len, 8, "ChordNet", 170,
        vote_aggregation="logit", use_overlap=True, overlap_ratio=.5,
        smooth_predictions=True, kernel_size=5, use_gaussian=True,
    )
    # Explicit silence gate; do not assign tonal chords to empty audio frames.
    rms = librosa.feature.rms(y=y, frame_length=4096, hop_length=2048)[0]
    count = min(len(rms), len(predictions))
    predictions[:count][rms[:count] < max(.00015, float(rms.max()) * .012)] = 169
    duration = len(y) / sr
    starts = np.r_[0, np.flatnonzero(np.diff(predictions)) + 1]
    segments = []
    for a, b in zip(starts, np.r_[starts[1:], len(predictions)]):
        begin, end = float(a * step), min(duration, float(b * step))
        if begin >= duration or end <= begin:
            continue
        raw = vocabulary[int(predictions[a])]
        segments.append({**chord_info(raw), "start": round(begin, 4), "end": round(end, 4),
                         "original_raw": raw, "edited": False,
                         "review": raw in ("N", "X") or end - begin < .55})
    progress(52, "和弦识别完成")
    return segments


@lru_cache(maxsize=1)
def pitch_model():
    from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
    from basic_pitch.inference import Model
    # Explicit ONNX avoids CoreML/TensorFlow selection differences across machines.
    path = build_icassp_2022_model_path(FilenameSuffix.onnx)
    verify_model(path, "basic_pitch")
    return Model(path)


def recognize_notes(path: Path, duration: float, sensitivity: float, progress) -> list[dict]:
    progress(56, "加载 Basic Pitch 音符模型")
    model = pitch_model()
    from basic_pitch.inference import predict
    progress(62, "Basic Pitch 正在逐音转录")
    _, _, events = predict(
        str(path), model_or_model_path=model,
        onset_threshold=sensitivity, frame_threshold=max(.12, sensitivity - .15),
        minimum_note_length=90, minimum_frequency=65.4, maximum_frequency=2093.,
        multiple_pitch_bends=True,
    )
    notes = []
    for start, end, midi, amplitude, bends in events:
        start, end = max(0., float(start)), min(duration, float(end))
        if end <= start or start >= duration:
            continue
        notes.append({"start": round(start, 4), "end": round(end, 4), "midi": int(midi),
                      "name": f"{PITCHES[midi % 12]}{midi // 12 - 1}",
                      "activation": round(float(amplitude), 4),
                      "bends": [int(v) for v in bends] if bends is not None else []})
    notes.sort(key=lambda n: (n["start"], n["midi"]))
    progress(87, "整理音符时间线")
    return notes
