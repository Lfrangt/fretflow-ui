"""Contract checks; real Demucs inference is covered by verify_separation.py."""
from pathlib import Path
import io
import numpy as np
import pytest
import soundfile as sf
import backend.app as service
import backend.separation as separator
from test_api import client, completed_job


def test_missing_separator_and_invalid_mode_do_not_create_jobs(client, monkeypatch):
    monkeypatch.setattr(service, "separation_available", lambda: False)
    assert client.post('/api/analyze', files={'file': ('song.wav', b'x')}, data={'separation': 'guitar'}).status_code == 503
    assert client.post('/api/analyze', files={'file': ('song.wav', b'x')}, data={'separation': 'unknown'}).status_code == 422
    assert not service.jobs


def test_separation_routing_stereo_duration_and_downloads(client, monkeypatch):
    sr = 44100
    signal = np.arange(sr * 2) / sr
    stereo = np.column_stack([.2 * np.sin(2 * np.pi * 220 * signal), .1 * np.sin(2 * np.pi * 330 * signal)])
    upload = io.BytesIO()
    sf.write(upload, stereo, sr, format='WAV')
    monkeypatch.setattr(service, 'separation_available', lambda: True)
    observed = {}
    def separate(source, output, progress):
        audio, rate = sf.read(source, always_2d=True)
        assert rate == sr and audio.shape == (sr, 2)
        assert not np.allclose(audio[:, 0], audio[:, 1])
        output.mkdir()
        for stem in separator.STEMS:
            sf.write(output / f'{stem}.wav', audio * .1, rate, subtype='FLOAT')
        return {'enabled': True, 'stems': list(separator.STEMS), 'notes_source': 'guitar', 'chords_source': 'original'}
    def analyze(path, mode, sensitivity, progress, *, notes_path):
        observed.update(original=path, notes=notes_path)
        assert sf.info(path).frames == sf.info(notes_path).frames
        return {'duration': 1., 'mode': mode, 'sensitivity': sensitivity, 'notes': [], 'chords': []}
    monkeypatch.setattr(service, 'separate_audio', separate)
    monkeypatch.setattr(service, 'analyze', analyze)
    response = client.post('/api/analyze', files={'file': ('mix.wav', upload.getvalue())},
                           data={'separation': 'guitar', 'clip_start': .25, 'clip_end': 1.25})
    assert response.status_code == 202
    job = service.jobs[response.json()['id']]
    service.work(job, job.folder / 'input.wav')
    assert job.status == 'done' and job.result['clip_start'] == .25
    assert observed['notes'] == job.folder / 'stems/guitar.wav'
    assert observed['original'] == job.folder / 'audio.wav'
    assert not (job.folder / 'input.wav').exists()
    for stem in separator.STEMS:
        response = client.get(f'/api/jobs/{job.id}/stems/{stem}', headers={'Range': 'bytes=0-99'})
        assert response.status_code == 206 and len(response.content) == 100
    assert client.get(f'/api/jobs/{job.id}/stems/missing').status_code == 404
    assert client.get(f'/api/jobs/{job.id}/audio').status_code == 200
    client.delete(f'/api/jobs/{job.id}')
    assert not job.folder.exists()


def test_old_results_have_no_stems_and_failed_separation_never_falls_back(client, monkeypatch):
    job = completed_job()
    assert client.get(f'/api/jobs/{job.id}/stems/guitar').status_code == 404
    job.separation = 'guitar'
    def fail(*_args):
        raise RuntimeError('separation failed')
    monkeypatch.setattr(service, 'separate_audio', fail)
    monkeypatch.setattr(service, 'analyze', lambda *_args, **_kwargs: pytest.fail('Must not silently analyze original'))
    service.work(job, job.folder / 'audio.wav')
    assert job.status == 'error' and job.error == 'separation failed'
    assert not job.folder.exists()


def test_tampered_checkpoint_is_rejected_before_loading(tmp_path, monkeypatch):
    checkpoint = tmp_path / 'wrong.th'
    checkpoint.write_bytes(b'not a model')
    monkeypatch.setattr(separator, 'CHECKPOINT', checkpoint)
    monkeypatch.setattr(separator, 'available', lambda: True)
    separator.separation_model.cache_clear()
    with pytest.raises(RuntimeError, match='校验失败'):
        separator.separation_model()


def test_note_engine_uses_guitar_but_chord_engine_uses_original(tmp_path, monkeypatch):
    from backend.analysis import analyze, SR
    import backend.engines as engines
    t = np.arange(SR * 2) / SR
    original, guitar = tmp_path/'original.wav', tmp_path/'guitar.wav'
    sf.write(original, .2*np.sin(2*np.pi*220*t), SR)
    sf.write(guitar, .1*np.sin(2*np.pi*330*t), SR)
    paths = {}
    def chords(path, *args):
        paths['chords'] = path
        return []
    def notes(path, *args):
        paths['notes'] = path
        return []
    monkeypatch.setattr(engines, 'recognize_chords', chords)
    monkeypatch.setattr(engines, 'recognize_notes', notes)
    result = analyze(original, 'both', .5, lambda *_: None, notes_path=guitar)
    assert paths == {'chords': original, 'notes': guitar}
    assert any('吉他轨' in warning for warning in result['warnings'])
    sf.write(guitar, np.zeros(SR*2), SR)
    paths.clear()
    result = analyze(original, 'notes', .5, lambda *_: None, notes_path=guitar)
    assert 'notes' not in paths and result['notes'] == []
    assert any('接近静音' in warning for warning in result['warnings'])
