from copy import deepcopy

from backend.refinement import refine_releases


def note(start, end, pitch=60, **flags):
    return {"start": start, "end": end, "midi": pitch, **flags}


def test_fusion_preserves_attacks_pitch_input_and_reports_every_release_change():
    primary = [note(.1, 1), note(.16, .6, 64), note(2, 2.5, 67)]
    original = deepcopy(primary)
    secondary = [note(.12, .7), note(.18, .9, 64)]
    result = refine_releases(primary, secondary, duration=3)
    assert primary == original
    assert [(n["start"], n["midi"]) for n in result["notes"]] == [(n["start"], n["midi"]) for n in primary]
    assert [n["end"] for n in result["notes"]] == [.7, .9, 2.5]
    assert result["changed_count"] == 2
    assert result["notes"][0]["release_original_end"] == 1
    assert result["unmatched_indices"] == [2]


def test_one_secondary_attack_cannot_modify_two_repeated_notes():
    result = refine_releases([note(.1, .2), note(.15, .3)], [note(.11, .4)], duration=1)
    assert result["changed_count"] == 1
    assert result["notes"][1]["end"] == .3


def test_manual_edits_exclusions_missing_and_invalid_release_are_preserved():
    primary = [note(0, .5, edited=True), note(1, 1.5, excluded=True), note(2, 2.5, added=True),
               note(3, 3.5), note(4, 4.5), note(5, 5.5)]
    secondary = [note(0, .8), note(1, 1.8), note(2, 2.8), note(3, 3.01),
                 note(4, 4.7, 61), note(5.2, 5.8)]
    assert refine_releases(primary, secondary, duration=6)["notes"] == primary


def test_release_cannot_extend_past_audio():
    result = refine_releases([note(.1, .5)], [note(.12, 2)], duration=1)
    assert result["notes"][0]["end"] == 1
