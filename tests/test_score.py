import xml.etree.ElementTree as ET
from backend.score import build_score, assign_notes, defaults, TUNINGS, NOTATION_BETA_NOTICE
from backend.theory import chord_info


def result(notes, **settings):
    return {"name": "A < B & guitar", "duration": 5., "notes": [dict(start=a, end=b, midi=p, activation=.8) for a, b, p in notes],
            "chords": [{**chord_info("C"), "start": 0, "end": 5}], "score_settings": {"bpm": 120, **settings}}


def test_musicxml_bar_accounting_pitch_and_cross_bar_ties():
    score = build_score(result([(0, 3, 60), (.5, 1, 64)]))
    xml = ET.fromstring(score["musicxml"])
    assert xml.findtext("work/work-title").startswith("A < B & guitar")
    for measure in xml.findall("part/measure"):
        assert sum(int(n.findtext("duration")) for n in measure.findall("note") if n.find("chord") is None) == 16
    assert xml.findall(".//tie[@type='start']") and xml.findall(".//tie[@type='stop']")
    assert {n.findtext("pitch/step") for n in xml.findall(".//note") if n.find("pitch") is not None} == {"C", "E"}
    assert xml.findtext(".//kind") == "major"
    assert xml.find(".//kind").get("text") == ""
    assert score["assigned_count"] == 2


def test_exported_score_retains_beta_status_and_accuracy_notice():
    xml = ET.fromstring(build_score(result([(0, 1, 60)]))["musicxml"])
    assert "Beta" in xml.findtext("work/work-title")
    assert "For reference only" in xml.findtext("movement-title")
    assert xml.findtext("identification/miscellaneous/miscellaneous-field[@name='transcription-accuracy']") == NOTATION_BETA_NOTICE


def test_harmony_kind_text_does_not_repeat_root_or_accidental():
    data = result([(0, 1, 64)])
    data["chords"] = [{**chord_info("C#:min7"), "start": 0, "end": 5}]
    xml = ET.fromstring(build_score(data)["musicxml"])
    assert xml.findtext(".//root-step") == "C"
    assert xml.findtext(".//root-alter") == "1"
    assert xml.find(".//kind").get("text") == "m7"


def test_capo_and_drop_d_positions_reproduce_detected_pitches():
    data = result([(0, 1, 40), (0, 1, 64), (1, 2, 69)], tuning="drop-d", capo=2)
    notes, omitted, _, _ = assign_notes(data, defaults(data))
    assert not omitted
    for note in notes:
        assert TUNINGS['drop-d'][note['string']-1] + 2 + note['fret'] == note['midi']
    assert len({n['string'] for n in notes if n['a'] == 0}) == 2


def test_out_of_range_and_excluded_notes_are_never_folded_or_fabricated():
    data = result([(0, 1, 10), (0, 1, 120), (0, 1, 60)])
    data['notes'][2]['excluded'] = True
    score = build_score(data)
    assert score['omitted_indices'] == [0, 1] and score['assigned_count'] == 0
    assert not ET.fromstring(score['musicxml']).findall('.//pitch')


def test_offset_meter_and_chord_timing():
    data = result([(1, 2, 60)], meter='3/4', offset=1)
    data['chords'].append({**chord_info('G:7'), 'start':2, 'end':5})
    score = build_score(data)
    xml = ET.fromstring(score['musicxml'])
    assert xml.findtext('.//time/beats') == '3'
    assert xml.find('part/measure/note').find('rest') is None
    measure = xml.find('part/measure')
    tick = 0
    for node in measure:
        if node.tag == 'note' and node.find('chord') is None: tick += int(node.findtext('duration'))
        if node.tag == 'harmony' and node.findtext('root/root-step') == 'G': assert tick == 8


def test_higher_fret_preference_changes_positions_without_transposing_notes():
    data = result([(0, 1, 60), (0, 1, 64), (0, 1, 67)])
    low, _, _, _ = assign_notes(data, defaults({**data, "score_settings": {"bpm": 120, "fret_min": 0, "fret_max": 5}}))
    high, omitted, _, _ = assign_notes(data, defaults({**data, "score_settings": {"bpm": 120, "fret_min": 8, "fret_max": 17}}))
    assert not omitted and len(high) == 3
    assert all(8 <= n["fret"] <= 17 for n in high)
    assert sum(n["fret"] for n in high) > sum(n["fret"] for n in low)
    assert len({n["string"] for n in high}) == 3
    for n in high:
        assert TUNINGS["standard"][n["string"] - 1] + n["fret"] == n["midi"]


def test_high_preference_keeps_low_basses_and_capo_drop_d_pitches():
    data = result([(0, .5, 40), (1, 2, 69)], tuning="drop-d", capo=2, fret_min=8, fret_max=17)
    assigned, omitted, _, _ = assign_notes(data, defaults(data))
    assert not omitted and len(assigned) == 2
    assert assigned[0]["fret"] == 0
    for n in assigned:
        assert TUNINGS["drop-d"][n["string"] - 1] + 2 + n["fret"] == n["midi"]
