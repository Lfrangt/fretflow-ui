from copy import deepcopy
import io
import json
import threading
import numpy as np
import pretty_midi
import pytest
import soundfile as sf
from fastapi.testclient import TestClient
import backend.app as service
from backend.theory import chord_info, enrich


class HoldExecutor:
    def submit(self, *args): pass
    def shutdown(self, **kwargs): pass


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(service,"RUNTIME",tmp_path)
    monkeypatch.setattr(service,"jobs",{})
    monkeypatch.setattr(service,"executor",HoldExecutor())
    with TestClient(service.app) as client:
        yield client


def completed_job():
    job=service.reserve("test.wav","both",.5)
    sf.write(job.folder/'audio.wav',np.zeros(22050),22050)
    job.result=enrich({"id":job.id,"name":job.name,"mode":"both","sensitivity":.5,"created":job.created,"revision":0,
        "duration":1.,"waveform":[0],"key":{"root":0,"mode":"major","label":"C 大调","edited":False},
        "notes":[{"start":.1,"end":.8,"midi":60,"activation":.8}],
        "chords":[{**chord_info('C'),"start":0.,"end":1.,"original_raw":"C","edited":False}]})
    job.status="done"
    service.save_result(job)
    return job


def test_score_range_is_validated_saved_and_used_by_musicxml(client):
    import xml.etree.ElementTree as ET
    job = completed_job()
    bad = client.patch(f'/api/jobs/{job.id}', json={"revision": 0, "score_settings": {"bpm": 120, "fret_min": 17, "fret_max": 8}})
    assert bad.status_code == 422
    response = client.patch(f'/api/jobs/{job.id}', json={"revision": 0, "score_settings": {"bpm": 120, "fret_min": 8, "fret_max": 17}})
    assert response.status_code == 200
    assert response.json()["score_settings"]["fret_min"] == 8
    assert response.json()["notes"] == job.result["notes"]
    xml = ET.fromstring(client.get(f'/api/jobs/{job.id}/export/score.musicxml').content)
    frets = [int(n.text) for n in xml.findall('.//technical/fret')]
    assert frets and all(8 <= fret <= 17 for fret in frets)
    saved = json.loads((job.folder/'result.json').read_text())
    assert saved['score_settings']['fret_max'] == 17


def test_edit_export_reload_and_conflict(client):
    job=completed_job()
    r=client.patch(f'/api/jobs/{job.id}',json={"revision":0,"chord":{"index":0,"raw":"A:min"}})
    assert r.status_code==200 and r.json()['chords'][0]['roman']=='vi'
    saved=json.loads((job.folder/'result.json').read_text())
    assert saved['chords'][0]['original_raw']=='C' and saved['chords'][0]['edited']
    assert client.patch(f'/api/jobs/{job.id}',json={"revision":0,"key":{"root":2,"mode":"major"}}).status_code==409
    csv=client.get(f'/api/jobs/{job.id}/export/chords.csv').content.decode('utf-8-sig')
    assert 'Am,vi' in csv
    assert client.get(f'/api/jobs/{job.id}').json()['result']['revision']==1
    r=client.patch(f'/api/jobs/{job.id}',json={"revision":1,"chord":{"index":0,"raw":"C"}})
    assert not r.json()['chords'][0]['edited']


def test_midi_contains_detected_notes_and_separate_theoretical_chords(client):
    job=completed_job()
    notes=client.get(f'/api/jobs/{job.id}/export/notes.mid')
    parsed=pretty_midi.PrettyMIDI(io.BytesIO(notes.content))
    assert [n.pitch for n in parsed.instruments[0].notes]==[60]
    assert 'Beta' in parsed.instruments[0].name and 'reference only' in parsed.instruments[0].name
    assert abs(parsed.instruments[0].notes[0].start-.1)<.003
    chords=pretty_midi.PrettyMIDI(io.BytesIO(client.get(f'/api/jobs/{job.id}/export/chords.mid').content))
    assert [n.pitch for n in chords.instruments[0].notes]==[48,52,55]
    assert 'theoretical' in chords.instruments[0].name


def test_manual_track_assignments_roundtrip_and_invalid_batches_are_atomic(client):
    import xml.etree.ElementTree as ET
    job = completed_job()
    job.result['notes'].append({'start': .2, 'end': .9, 'midi': 64, 'activation': .8})
    bad = client.patch(f'/api/jobs/{job.id}', json={'revision': 0, 'note_tracks': {'indices': [0, 99], 'track': 2}})
    assert bad.status_code == 422 and job.result['revision'] == 0
    assert 'track' not in job.result['notes'][0]
    for payload in [{'indices': [0], 'track': 3}, {'indices': [], 'track': 2}, {'indices': [-1], 'track': 1}]:
        assert client.patch(f'/api/jobs/{job.id}', json={'revision': 0, 'note_tracks': payload}).status_code == 422
    response = client.patch(f'/api/jobs/{job.id}', json={'revision': 0, 'note_tracks': {'indices': [1], 'track': 2}})
    assert response.status_code == 200
    saved = json.loads((job.folder/'result.json').read_text())
    assert saved['notes'][1]['track'] == 2 and saved['notes'][1]['track_edited']
    # A later pitch edit from an older client must not erase the track.
    response = client.patch(f'/api/jobs/{job.id}', json={'revision': 1, 'note': {'index': 1, 'midi': 65, 'start': .2, 'end': .9}})
    assert response.json()['notes'][1]['track'] == 2
    midi = pretty_midi.PrettyMIDI(io.BytesIO(client.get(f'/api/jobs/{job.id}/export/notes.mid').content))
    assert [[n.pitch for n in instrument.notes] for instrument in midi.instruments] == [[60], [65]]
    assert [i.name.split(' - ')[0] for i in midi.instruments] == ['Guitar 1', 'Guitar 2']
    xml = ET.fromstring(client.get(f'/api/jobs/{job.id}/export/score.musicxml').content)
    assert len(xml.findall('part')) == 2
    assert client.patch(f'/api/jobs/{job.id}', json={'revision': 0, 'note_tracks': {'indices': [0], 'track': 2}}).status_code == 409


def test_chord_chart_exports_preserve_estimates_and_unknown_segments(client):
    job = completed_job()
    job.result['chords'].append({**chord_info('X'), 'start': .8, 'end': 1., 'roman': '?', 'function': '', 'review': True, 'edited': False, 'original_raw': 'X'})
    chart = client.get(f'/api/jobs/{job.id}/export/chords.txt')
    assert chart.status_code == 200 and 'text/plain' in chart.headers['content-type']
    assert '0.00–1.00 | C | I' in chart.text
    assert 'Model estimate, not verified' in chart.text
    assert 'Needs review / 待回听' in chart.text
    assert 'Playing recommendation' in chart.text
    csv = client.get(f'/api/jobs/{job.id}/export/chords.csv').text
    assert 'review,status' in csv and 'Needs review' in csv


def test_chords_are_the_default_and_notes_require_a_mode_choice(client):
    upload = client.post('/api/analyze', files={'file': ('test.wav', b'test')})
    assert upload.status_code == 202
    assert service.jobs[upload.json()['id']].mode == 'chords'
    demo = client.post('/api/demo', json={})
    assert service.jobs[demo.json()['id']].mode == 'chords'
    beta = client.post('/api/demo', json={'sample': 'melody', 'mode': 'notes'})
    assert service.jobs[beta.json()['id']].mode == 'notes'


def test_reanalysis_can_opt_into_beta_without_changing_original(client):
    job = completed_job()
    original = deepcopy(job.result)
    response = client.post(f'/api/jobs/{job.id}/reanalyze', json={'separation': 'none', 'mode': 'notes'})
    assert response.status_code == 202
    child = service.jobs[response.json()['id']]
    assert child.mode == 'notes' and child.parent_id == job.id
    assert job.result == original and job.mode == 'both'


def test_upload_limits_validation_and_origin(client,monkeypatch):
    assert client.post('/api/analyze',files={'file':('bad.txt',b'hello')}).status_code==415
    assert client.post('/api/analyze',files={'file':('empty.wav',b'')}).status_code==400
    monkeypatch.setattr(service,'MAX_BYTES',8)
    assert client.post('/api/analyze',files={'file':('large.wav',b'x'*10)}).status_code==413
    assert not service.jobs and not list(service.RUNTIME.iterdir())
    assert client.post('/api/demo',json={},headers={'Origin':'https://example.com'}).status_code==403
    assert client.post('/api/demo',json={'mode':'bogus'}).status_code==422


def test_corrupt_audio_and_cancellation_clean_private_files(client):
    r=client.post('/api/analyze',files={'file':('broken.wav',b'not audio')})
    job=service.jobs[r.json()['id']]
    service.work(job,job.folder/'input.wav')
    assert job.status=='error' and not job.folder.exists()
    assert '无法读取音频' in job.error
    job=service.reserve('cancel.wav','both',.5)
    assert client.delete(f'/api/jobs/{job.id}').status_code==200
    service.work(job,job.folder/'input.wav')
    assert job.status=='cancelled' and not job.folder.exists()


def test_completed_delete_and_bad_chord_are_safe(client):
    job=completed_job()
    original=deepcopy(job.result)
    response=client.patch(f'/api/jobs/{job.id}',json={'revision':0,'chord':{'index':0,'raw':'made up'}})
    assert response.status_code==422 and job.result==original
    response=client.patch(f'/api/jobs/{job.id}',json={'revision':0,'chord':{'index':99,'raw':'C'}})
    assert response.status_code==422
    client.delete(f'/api/jobs/{job.id}')
    assert client.get(f'/api/jobs/{job.id}').status_code==404 and not job.folder.exists()
