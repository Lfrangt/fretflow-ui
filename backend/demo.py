"""Original deterministic synthesis. No third-party music or labeled analysis output."""
import numpy as np
from .analysis import SR


def pluck(midi: int, duration: float, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(int(SR * duration)) / SR
    f = 440 * 2 ** ((midi - 69) / 12)
    y = np.zeros_like(t)
    for h in range(1, 8):
        y += np.sin(2 * np.pi * f * h * t + rng.uniform(-.05, .05)) * np.exp(-t * (.8 + h * .22)) / h ** 1.6
    y *= np.minimum(t / .007, 1) * np.minimum((duration - t) / .06, 1)
    return y


def make_demo(mode: str = "harmony") -> np.ndarray:
    if mode == "melody":
        melody = [60, 62, 64, 67, 69, 67, 64, 62, 60]
        y = np.zeros(int(SR * 9.5))
        for i, midi in enumerate(melody):
            sound = pluck(midi, .75, i)
            begin = int((.25 + i) * SR)
            y[begin:begin + len(sound)] += sound
    else:
        voicings = [[48, 52, 55, 60, 64], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 47, 50, 55, 59]]
        y = np.zeros(SR * 16)
        for bar, chord in enumerate(voicings):
            for beat in range(4):
                for string, midi in enumerate(chord):
                    begin = int((bar * 4 + beat + string * .016) * SR)
                    sound = pluck(midi, min(1.35, 16 - begin / SR), bar * 24 + beat * 6 + string)
                    end = min(len(y), begin + len(sound))
                    y[begin:end] += sound[:end-begin] * (.95 if beat % 2 == 0 else .65)
    return (y / max(1e-9, np.max(np.abs(y))) * .75).astype(np.float32)
