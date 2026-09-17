"""Solo is a distinct, editable note-only contract, including old-job reanalysis."""
from copy import deepcopy
import io
import xml.etree.ElementTree as ET

import numpy as np
import pretty_midi
import pytest
import soundfile as sf

import backend.app as service
from backend.analysis import analyze
from test_api import client, completed_job


def test_solo_admission_capability_and_reanalysis_keep_original(client):
    assert client.get('/api/health').json()['features']['solo'] is True
    upload = client.post('/api/analyze', files={'file': ('solo.wav', b'test')}, data={'mode': 'solo'})
    assert upload.status_code == 202
    assert service.jobs[upload.json()['id']].mode == 'solo'
    service.jobs.clear()
    demo = client.post('/api/demo', json={'sample': 'melody', 'mode': 'solo'})
    assert demo.status_code == 202
    assert service.jobs[demo.json()['id']].mode == 'solo'
    service.jobs.clear()
    original = completed_job()
    original.result['clip_start'] = 37.5
    before = deepcopy(original.result)
    rerun = client.post(f'/api/jobs/{original.id}/reanalyze', json={'mode': 'solo', 'separation': 'none'})
    assert rerun.status_code == 202
    child = service.jobs[rerun.json()['id']]
    assert child.mode == 'solo' and child.source_offset == 37.5
    assert child.parent_id == original.id and original.result == before


def test_solo_routes_isolated_source_and_never_invents_harmony(tmp_path, monkeypatch):
    import backend.engines as engines
    import backend.solo as solo
    sr = 22050
    t = np.arange(sr * 2) / sr
    mix = tmp_path / 'mix.wav'
    stem = tmp_path / 'guitar.wav'
    sf.write(mix, .2 * np.sin(2 * np.pi * 110 * t), sr)
    sf.write(stem, .2 * np.sin(2 * np.pi * 440 * t), sr)
    def forbidden(*args, **kwargs):
        raise AssertionError('Solo must not run polyphonic/chord recognition')
    monkeypatch.setattr(engines, 'recognize_notes', forbidden)
    monkeypatch.setattr(engines, 'recognize_chords', forbidden)
    seen = []
    def recognize(path, duration, sensitivity, progress):
        seen.append(path)
        return [{'start': .1, 'end': .8, 'midi': 69, 'name': 'A4', 'activation': .8}]
    monkeypatch.setattr(solo, 'recognize_solo', recognize)
    result = analyze(mix, 'solo', .5, lambda *_: None, notes_path=stem)
    assert seen == [stem]
    assert result['mode'] == 'solo' and result['chords'] == []
    assert result['key']['root'] is None and result['chroma'] == []
    assert result['notes'][0]['midi'] == 69
    assert any('separated guitar' in text for text in result['warnings'])
    assert result['engines']['chords'] is None


def test_solo_can_edit_and_export_notes_without_chords(client):
    job = completed_job()
    job.mode = job.result['mode'] = 'solo'
    job.result['chords'] = []
    job.result['key'] = {'root': None, 'mode': None, 'label': '未确定'}
    edited = client.patch(f'/api/jobs/{job.id}', json={'revision': 0, 'note': {'index': 0, 'midi': 69, 'start': .1, 'end': .75}})
    assert edited.status_code == 200 and edited.json()['notes'][0]['midi'] == 69
    assert edited.json()['chords'] == []
    xml = ET.fromstring(client.get(f'/api/jobs/{job.id}/export/score.musicxml').content)
    assert xml.findall('.//pitch') and xml.findall('.//technical/fret')
    assert not xml.findall('.//harmony')
    midi = pretty_midi.PrettyMIDI(io.BytesIO(client.get(f'/api/jobs/{job.id}/export/notes.mid').content))
    assert [n.pitch for n in midi.instruments[0].notes] == [69]
    assert client.get('/api/jobs').json()[0]['mode'] == 'solo'


def test_solo_midi_does_not_turn_voicing_probability_into_dynamics(client):
    job = completed_job()
    job.mode = job.result['mode'] = 'solo'
    job.result['chords'] = []
    job.result['notes'] = [
        {'midi': 69, 'start': .1, 'end': .3, 'activation': .24},
        {'midi': 69, 'start': .5, 'end': .8, 'activation': .99},
    ]
    response = client.get(f'/api/jobs/{job.id}/export/notes.mid')
    assert response.status_code == 200
    notes = pretty_midi.PrettyMIDI(io.BytesIO(response.content)).instruments[0].notes
    assert [note.velocity for note in notes] == [95, 95]
    assert [note.pitch for note in notes] == [69, 69]
    assert [note.start for note in notes] == pytest.approx([.1, .5], abs=.003)
    assert [note.end for note in notes] == pytest.approx([.3, .8], abs=.003)


@pytest.mark.parametrize('velocity,expected', [(73.5, 74), (0, 1), (200, 127),
                                             (None, 95), (float('nan'), 95),
                                             (float('inf'), 95), ('74', 95), (True, 95)])
def test_solo_midi_explicit_velocity_matches_web_player_rules(client, velocity, expected):
    job = completed_job()
    job.mode = job.result['mode'] = 'solo'
    job.result['notes'][0]['velocity'] = velocity
    response = client.get(f'/api/jobs/{job.id}/export/notes.mid')
    assert response.status_code == 200
    notes = pretty_midi.PrettyMIDI(io.BytesIO(response.content)).instruments[0].notes
    assert notes[0].velocity == expected


def test_existing_polyphonic_midi_velocity_is_preserved(client):
    job = completed_job()
    response = client.get(f'/api/jobs/{job.id}/export/notes.mid')
    notes = pretty_midi.PrettyMIDI(io.BytesIO(response.content)).instruments[0].notes
    assert notes[0].velocity == 102
