import io
from copy import deepcopy
import numpy as np
import soundfile as sf
import backend.app as service
from test_api import client, completed_job


def wav_bytes(samples, rate=44100):
    stream = io.BytesIO()
    sf.write(stream, samples, rate, format='WAV', subtype='FLOAT')
    return stream.getvalue()


def test_instrumental_is_transcribed_but_original_is_preserved(client, monkeypatch):
    raw = np.stack([np.full(44100, .25), np.full(44100, .5)], 1)
    seen = []
    monkeypatch.setattr(service, 'vocal_removal_available', lambda: True)
    def separate(source, output, progress):
        data, rate = sf.read(source, always_2d=True)
        assert rate == 44100 and data.shape == raw.shape
        np.testing.assert_allclose(data, raw, atol=1e-6)
        output.mkdir(parents=True, exist_ok=True)
        sf.write(output/'instrumental.wav', data*.1, rate, subtype='FLOAT')
        sf.write(output/'vocals.wav', data*.9, rate, subtype='FLOAT')
        return dict(enabled=True, mode='instrumental', stems=['instrumental','vocals'], notes_source='instrumental', chords_source='instrumental')
    monkeypatch.setattr(service, 'remove_vocals', separate)
    def analyze(path, mode, sensitivity, progress):
        data, rate = sf.read(path, always_2d=True)
        seen.append(path)
        assert float(np.max(data)) < .051
        assert mode == 'both'
        return {'duration':1.,'notes':[],'chords':[],'warnings':[],'mode':mode,'sensitivity':sensitivity}
    monkeypatch.setattr(service, 'analyze', analyze)
    response = client.post('/api/analyze',files={'file':('guitar.wav',wav_bytes(raw))},data={'separation':'instrumental','mode':'both'})
    assert response.status_code == 202
    job = service.jobs[response.json()['id']]
    service.work(job, job.folder/'input.wav')
    assert job.status == 'done' and seen
    data, rate = sf.read(io.BytesIO(client.get(f'/api/jobs/{job.id}/audio').content),always_2d=True)
    np.testing.assert_allclose(data, raw, atol=1e-6)
    assert rate == 44100
    assert client.get(f'/api/jobs/{job.id}/stems/instrumental').status_code == 200
    assert client.get(f'/api/jobs/{job.id}/stems/guitar').status_code == 404


def test_reanalyze_keeps_edits_source_and_offset(client, monkeypatch):
    job = completed_job()
    job.result['clip_start'] = 40.5
    job.result['notes'][0]['edited'] = True
    before = deepcopy(job.result)
    monkeypatch.setattr(service, 'vocal_removal_available', lambda: True)
    response = client.post(f'/api/jobs/{job.id}/reanalyze',json={'separation':'instrumental'})
    assert response.status_code == 202
    new = service.jobs[response.json()['id']]
    assert new.id != job.id and new.source_offset == 40.5 and new.clip_start == 0
    assert new.parent_id == job.id and new.legacy_source
    assert (new.folder/'input.wav').read_bytes() == (job.folder/'audio.wav').read_bytes()
    assert job.result == before
    assert client.get(f'/api/jobs/{job.id}/audio').status_code == 200
    assert client.get(f'/api/jobs/{job.id}/stems/instrumental').status_code == 404


def test_failed_removal_never_falls_back_to_vocal_mix(client, monkeypatch):
    monkeypatch.setattr(service, 'vocal_removal_available', lambda: True)
    def fail(*args): raise RuntimeError('separation failed')
    monkeypatch.setattr(service,'remove_vocals',fail)
    def never(*args, **kwargs): raise AssertionError('must not transcribe original on failure')
    monkeypatch.setattr(service,'analyze',never)
    response=client.post('/api/analyze',files={'file':('test.wav',wav_bytes(np.zeros((44100,2))))},data={'separation':'instrumental'})
    job=service.jobs[response.json()['id']]
    service.work(job,job.folder/'input.wav')
    assert job.status=='error' and job.error=='separation failed' and not job.folder.exists()


def test_reanalysis_reuses_completed_stems_without_running_separation_again(client, monkeypatch):
    job=completed_job()
    raw=np.stack([np.full(44100,.25),np.full(44100,.5)],1)
    sf.write(job.folder/'audio.wav',raw,44100,subtype='FLOAT')
    (job.folder/'stems').mkdir()
    for stem in ['instrumental','vocals']:
        sf.write(job.folder/'stems'/f'{stem}.wav',raw*.5,44100,subtype='FLOAT')
    job.result.update(duration=1.,separation=dict(enabled=True,mode='instrumental',model='htdemucs',stems=['instrumental','vocals'],notes_source='instrumental',chords_source='instrumental'))
    monkeypatch.setattr(service,'vocal_removal_available',lambda:True)
    def never(*args): raise AssertionError('identical stems should not be recomputed')
    monkeypatch.setattr(service,'remove_vocals',never)
    monkeypatch.setattr(service,'analyze',lambda *a,**kw:dict(duration=1.,notes=[],chords=[],warnings=[],mode='notes',sensitivity=.5))
    response=client.post(f'/api/jobs/{job.id}/reanalyze',json={'mode':'notes','separation':'instrumental'})
    assert response.status_code==202
    new=service.jobs[response.json()['id']]
    assert (new.folder/'stems/instrumental.wav').read_bytes()==(job.folder/'stems/instrumental.wav').read_bytes()
    # The new result does not depend on the parent's continued existence.
    (job.folder/'stems/instrumental.wav').unlink()
    service.work(new,new.folder/'input.wav')
    assert new.status=='done'
    assert new.result['processing']['reused_stems'] is True
    assert new.result['separation']['seconds']==0.


def test_missing_stem_falls_back_to_normal_reanalysis(client,monkeypatch):
    job=completed_job()
    sf.write(job.folder/'audio.wav',np.zeros((44100,2)),44100,subtype='FLOAT')
    job.result['separation']=dict(mode='instrumental',stems=['instrumental','vocals'])
    monkeypatch.setattr(service,'vocal_removal_available',lambda:True)
    response=client.post(f'/api/jobs/{job.id}/reanalyze',json={'separation':'instrumental'})
    new=service.jobs[response.json()['id']]
    assert not (new.folder/'prepared-stems.json').exists()
