import pytest
from backend.theory import chord_info, function_label


@pytest.mark.parametrize("raw,expected", [("C",["C","E","G"]),("A:min7",["A","C","E","G"]),("B:hdim7",["B","D","F","A"]),("C:dim7",["C","D#","F#","A"])])
def test_chord_tones(raw, expected):
    assert chord_info(raw)["notes"] == expected


def test_harmony_respects_key_and_non_diatonic_seventh():
    major = {"root":0,"mode":"major"}
    assert function_label(chord_info("A:min"),major)["roman"] == "vi"
    assert function_label(chord_info("G:7"),major)["roman"] == "V7"
    assert "变体" in function_label(chord_info("C:7"),major)["function"]
    assert "升导音" in function_label(chord_info("E:7"),{"root":9,"mode":"minor"})["function"]
    assert function_label(chord_info("N"),major)["roman"] == "—"


def test_manual_inversion_and_invalid_label():
    assert chord_info("C/E")["bass"] == "E"
    with pytest.raises(ValueError): chord_info("../../bad")
    with pytest.raises(ValueError): chord_info("C:madeup")
