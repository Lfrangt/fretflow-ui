from scripts.benchmark_transcription import compare


def note(start, end, midi=60):
    return {"start": start, "end": end, "midi": midi}


def test_matching_counts_wrong_pitch_missing_notes_and_duplicates():
    reference = [note(0, 1), note(2, 3, 64), note(4, 5, 67)]
    estimated = [note(.02, 1), note(.025, 1), note(2, 3, 65)]
    metrics = compare(reference, estimated)["pitch_onset"]
    assert metrics["matched_notes"] == 1
    assert metrics["false_notes"] == 2
    assert metrics["missed_notes"] == 2
    assert abs(metrics["f1"] - 1 / 3) < 1e-9


def test_late_attacks_and_bad_durations_are_measured_separately():
    reference = [note(0, 1), note(2, 3)]
    metrics = compare(reference, [note(.07, 1), note(2.02, 2.2)])
    assert metrics["pitch_onset"]["matched_notes"] == 1
    assert metrics["pitch_onset_offset"]["matched_notes"] == 0


def test_empty_estimate_reports_all_reference_notes_missed():
    metrics = compare([note(0, 1)], [])["pitch_onset"]
    assert metrics["missed_notes"] == 1
    assert metrics["recall"] == 0
