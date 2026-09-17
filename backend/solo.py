"""Bounded, monophonic F0 transcription for an isolated guitar solo.

This is not a source separator: with simultaneous instruments, pYIN may follow
the wrong fundamental. ``activation`` is pYIN voicing probability, not a
calibrated probability that the written note is correct. See docs/SOLO-ENGINE.md.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .theory import PITCHES

SR = 22050
HOP = 128
FRAME = 1024
CHUNK_FRAMES = 688  # About four seconds; bounds Viterbi memory and cancellation latency.
CONTEXT_FRAMES = 32
MIN_NOTE_SECONDS = .04


def _runs(values: np.ndarray):
    boundaries = np.r_[0, np.flatnonzero(values[1:] != values[:-1]) + 1, len(values)]
    return [(int(a), int(b), int(values[a])) for a, b in zip(boundaries[:-1], boundaries[1:])]


def _pitch_track(y: np.ndarray, progress):
    import librosa

    count = 1 + len(y) // HOP
    pitch = np.full(count, np.nan, dtype=np.float64)
    probability = np.zeros(count, dtype=np.float64)
    voiced = np.zeros(count, dtype=bool)
    for first in range(0, count, CHUNK_FRAMES):
        progress(60 + int(24 * first / count), "Solo 正在逐音追踪主旋律")
        last = min(count, first + CHUNK_FRAMES)
        left, right = max(0, first - CONTEXT_FRAMES), min(count, last + CONTEXT_FRAMES)
        fragment = y[left * HOP:min(len(y), right * HOP)]
        # A 25-cent lattice distinguishes semitones while keeping Viterbi bounded.
        # The high transition allowance retains quick octave jumps in lead lines.
        f0, flag, prob = librosa.pyin(
            fragment, sr=SR, fmin=float(librosa.midi_to_hz(36)),
            fmax=float(librosa.midi_to_hz(96)), frame_length=FRAME,
            hop_length=HOP, resolution=.25, n_thresholds=32,
            max_transition_rate=100., fill_na=np.nan,
        )
        source = slice(first - left, last - left)
        pitch[first:last], voiced[first:last], probability[first:last] = f0[source], flag[source], prob[source]
    return pitch, voiced, probability


def _attack_frames(rms: np.ndarray, floor: float) -> np.ndarray:
    """Energy rises distinguish a new pick from a sustained identical pitch.

    A short median suppresses the oscillating RMS of low strings. Requiring a
    sizeable rise avoids treating tremolo/vibrato as dozens of new notes.
    """
    from scipy.ndimage import median_filter
    from scipy.signal import find_peaks

    smooth = median_filter(rms, size=3, mode="nearest")
    lag = 3
    before = np.r_[np.repeat(smooth[0], lag), smooth[:-lag]]
    rise = np.log(np.maximum(smooth, floor)) - np.log(np.maximum(before, floor))
    peaks, _ = find_peaks(rise, height=.38, prominence=.25, distance=8)
    return peaks[smooth[peaks] > floor * 2]


def recognize_solo(path: Path, duration: float, sensitivity: float, progress) -> list[dict]:
    """Return one note at a time, in the existing transcription note schema.

    Input is the original or already-separated audio, with timestamps relative
    to that file. ``progress`` is called before each bounded inference chunk;
    exceptions (including job cancellation) propagate without a fallback.
    """
    progress(56, "加载 Solo 单音分析组件")
    import librosa
    from scipy.ndimage import median_filter

    if not np.isfinite(duration) or duration <= 0:
        return []
    # Do not analyze beyond the pipeline's clip boundary.
    y, _ = librosa.load(path, sr=SR, mono=True, duration=duration)
    duration = min(float(duration), len(y) / SR)
    if len(y) < FRAME or not np.all(np.isfinite(y)):
        return []
    sensitivity = float(np.clip(sensitivity if np.isfinite(sensitivity) else .5, 0., 1.))
    rms = librosa.feature.rms(y=y, frame_length=256, hop_length=HOP)[0]
    peak = float(np.max(rms))
    if peak < .0001:
        progress(87, "Solo 音轨接近静音")
        return []
    floor = max(.00008, peak * (.006 + .016 * sensitivity))
    f0, voiced, probability = _pitch_track(y, progress)
    count = min(len(rms), len(f0))
    rms, f0, voiced, probability = rms[:count], f0[:count], voiced[:count], probability[:count]
    sounding = rms >= floor
    accepted = voiced & sounding & np.isfinite(f0) & (probability >= .08 + .28 * sensitivity)
    midi_float = librosa.hz_to_midi(np.where(np.isfinite(f0), f0, 440.))
    pitches = np.where(accepted, np.rint(midi_float), 0).astype(np.int16)
    pitches = median_filter(pitches, size=3, mode="nearest")
    pitches[~sounding] = 0  # Never bridge an actual silence using pitch smoothing.

    # Repair very short unvoiced holes only when audio is present and both sides
    # agree; a rest or a different note remains a boundary.
    for a, b, pitch in _runs(pitches):
        if pitch == 0 and b - a <= 3 and a > 0 and b < count:
            if pitches[a - 1] == pitches[b] and np.all(sounding[a:b]):
                pitches[a:b] = pitches[b]

    attacks = _attack_frames(rms, floor)
    seconds_per_frame = HOP / SR
    notes = []
    for a, b, midi in _runs(pitches):
        if not midi or (b - a) * seconds_per_frame < MIN_NOTE_SECONDS:
            continue
        # Retain distinct picks on a repeated pitch, but do not split on a
        # transition's own attack or on a tiny decay at its end.
        internal = attacks[(attacks - a >= 8) & (b - attacks >= 8)]
        boundaries = [a, *[int(x) for x in internal], b]
        for left, right in zip(boundaries[:-1], boundaries[1:]):
            start = max(0., (left - .5) * seconds_per_frame)
            end = min(duration, (right - .5) * seconds_per_frame)
            if end - start < MIN_NOTE_SECONDS:
                continue
            valid = accepted[left:right]
            values = probability[left:right][valid]
            activation = float(np.mean(values)) if len(values) else 0.
            spread = midi_float[left:right][valid]
            unstable = len(spread) > 1 and float(np.percentile(spread, 90) - np.percentile(spread, 10)) > .6
            notes.append({
                "start": round(start, 4), "end": round(end, 4), "midi": midi,
                "name": f"{PITCHES[midi % 12]}{midi // 12 - 1}",
                "activation": round(activation, 4), "bends": [],
                "review": activation < .7 or end - start < .085 or unstable,
            })
    progress(87, "整理 Solo 单音时间线")
    return notes
