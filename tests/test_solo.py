"""Audio-level regressions: these exercise the real pYIN implementation."""
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from backend.solo import recognize_solo, SR


def render(path: Path, events, *, duration=None, harmonics=(1., .45, .2, .1), decay=1.2):
    duration = duration or max(end for _, end, _ in events) + .15
    audio = np.zeros(round(duration * SR), dtype=np.float32)
    for start, end, midi in events:
        first, last = round(start * SR), round(end * SR)
        t = np.arange(last - first) / SR
        frequency = 440. * 2 ** ((midi - 69) / 12)
        envelope = np.minimum(t / .004, 1.) * np.minimum((end - start - t) / .008, 1.) * np.exp(-decay * t)
        tone = sum(weight * np.sin(2 * np.pi * frequency * harmonic * t)
                   for harmonic, weight in enumerate(harmonics, 1))
        audio[first:last] += (.25 * envelope * tone / sum(harmonics)).astype(np.float32)
    sf.write(path, audio, SR, subtype="FLOAT")
    return duration


def analyze(path, duration):
    return recognize_solo(path, duration, .5, lambda *_: None)


def assert_matches(notes, expected, tolerance=.045):
    assert [n["midi"] for n in notes] == [midi for _, _, midi in expected], notes
    for note, (start, end, _) in zip(notes, expected):
        assert abs(note["start"] - start) <= tolerance, note
        assert abs(note["end"] - end) <= tolerance, note
        assert 0. <= note["activation"] <= 1.
        assert note["start"] < note["end"]
    assert all(left["end"] <= right["start"] for left, right in zip(notes, notes[1:]))


def test_exact_octaves_across_guitar_range_with_dominant_second_harmonic(tmp_path):
    events = [(i * .5 + .1, i * .5 + .45, midi) for i, midi in enumerate([38, 40, 52, 64, 76, 88])]
    path = tmp_path / "harmonics.wav"
    duration = render(path, events, harmonics=(.2, 1., .45, .23, .1))
    notes = analyze(path, duration)
    assert_matches(notes, events)
    assert [n["name"] for n in notes] == ["D2", "E2", "E3", "E4", "E5", "E6"]


def test_same_pitch_attacks_and_rests_are_not_merged(tmp_path):
    events = [(.1, .5, 64), (.5, .9, 64), (1.1, 1.5, 64), (1.52, 1.9, 64)]
    path = tmp_path / "repeated.wav"
    duration = render(path, events, decay=3.)
    notes = analyze(path, duration)
    assert_matches(notes, events)
    assert notes[2]["start"] - notes[1]["end"] > .15


def test_fast_seventy_five_ms_notes_remain_individual(tmp_path):
    events = [(.2 + i * .075, .2 + (i + 1) * .075, midi)
              for i, midi in enumerate([64, 66, 67, 69, 71, 72, 74, 76, 74, 72, 71, 69])]
    path = tmp_path / "fast.wav"
    duration = render(path, events, decay=0.)
    assert_matches(analyze(path, duration), events)


def test_sustained_note_crosses_inference_chunk_without_retrigger(tmp_path):
    path = tmp_path / "sustained.wav"
    events = [(.1, 5., 57)]
    duration = render(path, events, decay=0.)
    assert_matches(analyze(path, duration), events)


@pytest.mark.parametrize("noise", [False, True])
def test_silence_and_unpitched_noise_do_not_become_notes(tmp_path, noise):
    path = tmp_path / "silence.wav"
    y = np.random.default_rng(11).normal(0., .04, SR).astype(np.float32) if noise else np.zeros(SR)
    sf.write(path, y, SR, subtype="FLOAT")
    assert analyze(path, 1.) == []


def test_duration_boundary_is_respected(tmp_path):
    path = tmp_path / "cropped.wav"
    render(path, [(.1, 1.4, 69)], decay=0.)
    notes = analyze(path, .7)
    assert len(notes) == 1
    assert .66 <= notes[0]["end"] <= .7


def test_cancellation_propagates_between_chunks(tmp_path):
    path = tmp_path / "cancel.wav"
    duration = render(path, [(.1, 8.9, 64)], decay=0.)
    progress_values = []

    def progress(value, message):
        progress_values.append(value)
        if 60 < value < 87:
            raise RuntimeError("cancelled")

    with pytest.raises(RuntimeError, match="cancelled"):
        recognize_solo(path, duration, .5, progress)
    assert progress_values[0] == 56
    assert 60 in progress_values
