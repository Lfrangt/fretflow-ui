"""Run both local neural models and prepare editable, time-aligned results."""
from pathlib import Path
import time
import numpy as np
from .theory import PITCHES, enrich

SR = 22050
HOP = 512


def estimate_key(chroma: np.ndarray, weights: np.ndarray) -> dict:
    unknown = {"label": "未确定", "root": None, "mode": None, "fit": 0., "alternatives": [], "edited": False}
    if np.sum(weights) < 1e-6 or np.max(chroma) < 1e-6:
        return unknown
    average = np.average(chroma, axis=1, weights=weights + 1e-9)
    profiles = {
        "major": [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
        "minor": [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
    }
    candidates = []
    for mode, profile in profiles.items():
        for root in range(12):
            fit = float(np.corrcoef(average, np.roll(profile, root))[0, 1]) if np.std(average) > 1e-8 else 0.
            candidates.append({"root": root, "mode": mode, "label": f"{PITCHES[root]} {'大调' if mode == 'major' else '小调'}", "fit": round(max(0., fit), 3)})
    candidates.sort(key=lambda k: k["fit"], reverse=True)
    if candidates[0]["fit"] < .35:
        return {**unknown, "alternatives": candidates[:3]}
    return {**candidates[0], "alternatives": candidates[1:3], "ambiguous": candidates[0]["fit"] - candidates[1]["fit"] < .08, "edited": False}


def analyze(path: Path, mode: str, sensitivity: float, progress, *, notes_path: Path | None = None) -> dict:
    progress(12, "加载音频分析组件")
    import librosa
    from scipy.ndimage import median_filter
    from .engines import recognize_chords, recognize_notes
    started = time.monotonic()
    y, _ = librosa.load(path, sr=SR, mono=True)
    if len(y) < SR // 2:
        raise ValueError("音频太短，请选择至少 0.5 秒的录音。")
    duration = len(y) / SR
    progress(15, "读取音频与波形")
    waveform = [round(float(np.max(np.abs(c))), 4) for c in np.array_split(y, min(len(y), 1000))]
    base = {"schema_version": 1, "duration": round(duration, 4), "sample_rate": SR, "waveform": waveform,
            "mode": mode, "sensitivity": sensitivity, "chords": [], "notes": [], "chroma": [],
            "key": {"label": "未确定", "root": None, "mode": None, "fit": 0, "alternatives": [], "edited": False},
            "engines": {"chords": "ChordMini · ChordNet 2E1D", "notes": "Spotify Basic Pitch 0.4.0 · ONNX"}}
    if np.max(np.abs(y)) < .0001:
        return {**base, "warnings": ["音频接近静音，未检测到足够的音高信息。"], "analysis_seconds": round(time.monotonic()-started, 2)}
    if mode in ("both", "chords"):
        base["chords"] = recognize_chords(path, y, SR, progress)
    weak_guitar = False
    if mode in ("both", "notes"):
        if notes_path is not None:
            guitar, _ = librosa.load(notes_path, sr=SR, mono=True)
            if abs(len(guitar) - len(y)) > 2:
                raise ValueError("吉他轨与原音时长不一致，无法对齐视频谱。")
            weak_guitar = not len(guitar) or float(np.max(np.abs(guitar))) < .0001
        if not weak_guitar:
            base["notes"] = recognize_notes(notes_path or path, duration, sensitivity, progress)
    progress(90, "估计调性与整理和声级数")
    harmonic = librosa.effects.harmonic(y, margin=2)
    chroma = librosa.feature.chroma_cqt(y=harmonic, sr=SR, hop_length=HOP, n_octaves=6, threshold=.1)
    chroma = median_filter(chroma, size=(1, 5))
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    frames = min(chroma.shape[1], len(rms))
    chroma, rms = chroma[:, :frames], rms[:frames]
    chroma[:, rms < max(.00015, float(np.max(rms)) * .012)] = 0
    base["key"] = estimate_key(chroma, rms)
    onset_envelope = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_envelope, sr=SR, hop_length=HOP)
    tempo = librosa.feature.tempo(onset_envelope=onset_envelope, sr=SR, hop_length=HOP)
    tempo_value = float(np.asarray(tempo).reshape(-1)[0])
    base["tempo"] = {"bpm": round(tempo_value, 1) if len(onsets) >= 3 and 30 <= tempo_value <= 240 else None,
                     "estimated": True}
    stride = max(1, int(np.ceil(frames / 300)))
    base["chroma"] = [{"time": round(a*HOP/SR, 4), "values": np.round(np.mean(chroma[:, a:a+stride], axis=1), 3).tolist()} for a in range(0, frames, stride)]
    base["warnings"] = ["模型结果需要回听确认。整首混音、失真和强混响可能导致漏音、误音与和弦歧义。",
                        "当前和弦模型不自动识别转位或九、十一、十三和弦。构成音是理论推导；音符轨道才是逐音转录。"]
    if notes_path is not None:
        base["warnings"].append("音符来自分离的吉他轨；和弦、调性和速度参考原音。分离可能漏掉弱音或残留其他乐器，请对照回听。")
    if weak_guitar:
        base["warnings"].append("分离后的吉他轨接近静音，未生成音符。请回听原音，或改用原音分析。")
    if base["key"].get("ambiguous"):
        base["warnings"].append("调性有相近候选。可手动选择调性；和声级数会随之更新。")
    base["analysis_seconds"] = round(time.monotonic() - started, 2)
    return enrich(base)
