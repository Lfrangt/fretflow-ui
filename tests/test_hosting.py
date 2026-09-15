import pytest
from fastapi.testclient import TestClient
import backend.app as service


class HoldExecutor:
    def __init__(self): self.calls = []
    def submit(self, *args): self.calls.append(args)
    def shutdown(self, **kwargs): pass


@pytest.fixture
def hosted(tmp_path, monkeypatch):
    monkeypatch.setenv('FRETFLOW_HOSTED', '1')
    monkeypatch.setenv('FRETFLOW_WORKER_TOKEN', 'test-only-' + 'x' * 40)
    monkeypatch.setenv('FRETFLOW_ALLOWED_ORIGINS', 'https://fretflow.example')
    monkeypatch.setattr(service, 'RUNTIME', tmp_path / 'jobs')
    monkeypatch.setattr(service, 'jobs', {})
    monkeypatch.setattr(service, 'executor', HoldExecutor())
    with TestClient(service.app) as client:
        yield client


def headers(user='a'):
    return {'Authorization': 'Bearer test-only-' + 'x' * 40,
            'X-FretFlow-Owner': user * 64, 'X-FretFlow-Origin': 'https://fretflow.example'}


def test_owner_boundary_covers_job_reads_mutations_and_downloads(hosted):
    assert hosted.get('/api/jobs').status_code == 401
    assert hosted.get('/api/jobs', headers={'Authorization': headers()['Authorization']}).status_code == 401
    job_id = hosted.post('/api/demo', json={}, headers=headers()).json()['id']
    assert hosted.get(f'/api/jobs/{job_id}', headers=headers()).status_code == 200
    for suffix in ['', '/audio', '/score', '/export/json', '/download-ticket']:
        assert hosted.get(f'/api/jobs/{job_id}{suffix}', headers=headers('b')).status_code == 404
    assert hosted.delete(f'/api/jobs/{job_id}', headers=headers('b')).status_code == 404
    assert hosted.patch(f'/api/jobs/{job_id}', headers=headers('b'), json={'revision': 0}).status_code == 404
    service.jobs[job_id].status = 'done'
    service.jobs[job_id].result = {}
    assert len(hosted.get('/api/jobs', headers=headers()).json()) == 1
    assert hosted.get('/api/jobs', headers=headers('b')).json() == []
    assert (service.jobs[job_id].folder / 'owner.txt').read_text() == 'a' * 64


def test_upload_ticket_is_single_use_and_cannot_read_jobs(hosted):
    grant = hosted.post('/api/upload-ticket', headers=headers()).json()
    ticket_headers = {'X-FretFlow-Ticket': grant['ticket'], 'Origin': 'https://fretflow.example'}
    assert hosted.get('/api/jobs', headers=ticket_headers).status_code == 401
    preflight = hosted.options('/api/analyze', headers={'Origin': 'https://fretflow.example'})
    assert preflight.status_code == 204
    first = hosted.post('/api/analyze', files={'file': ('test.wav', b'file')}, headers=ticket_headers)
    assert first.status_code == 202
    assert first.headers['access-control-allow-origin'] == 'https://fretflow.example'
    assert hosted.post('/api/analyze', files={'file': ('test.wav', b'file')}, headers=ticket_headers).status_code == 401
    assert hosted.get('/api/jobs/' + first.json()['id'], headers=headers('b')).status_code == 404


def test_upload_ticket_rejects_other_origins_and_tampering(hosted):
    grant = hosted.post('/api/upload-ticket', headers=headers()).json()
    for ticket, origin in [(grant['ticket'], 'https://evil.example'), (grant['ticket'] + 'x', 'https://fretflow.example')]:
        response = hosted.post('/api/analyze', files={'file': ('test.wav', b'file')}, headers={'X-FretFlow-Ticket': ticket, 'Origin': origin})
        assert response.status_code == 401
    assert hosted.post('/api/upload-ticket', headers={**headers(), 'X-FretFlow-Origin': 'https://evil.example'}).status_code == 403


def test_quotas_survive_job_deletion_and_have_global_ceiling(hosted, monkeypatch):
    monkeypatch.setenv('FRETFLOW_DAILY_TOTAL', '3')
    for _ in range(2):
        job_id = hosted.post('/api/demo', json={}, headers=headers()).json()['id']
        assert hosted.post('/api/demo', json={}, headers=headers()).status_code == 429
        service.jobs[job_id].status = 'done'
        assert hosted.delete('/api/jobs/' + job_id, headers=headers()).status_code == 200
    assert hosted.post('/api/demo', json={}, headers=headers()).status_code == 429
    assert hosted.post('/api/demo', json={}, headers=headers('b')).status_code == 202
    assert hosted.post('/api/demo', json={}, headers=headers('c')).status_code == 429


def test_download_ticket_is_scoped_and_allows_audio_ranges(hosted):
    job_id = hosted.post('/api/demo', json={}, headers=headers()).json()['id']
    service.jobs[job_id].status = 'done'
    path = f'/api/jobs/{job_id}/audio'
    grant = hosted.get(f'/api/jobs/{job_id}/download-ticket', headers={
        **headers(), 'X-FretFlow-Download-Path': path}).json()
    for _ in range(2):
        response = hosted.get(path, params={'ticket': grant['ticket']}, headers={'Range': 'bytes=0-99'})
        assert response.status_code == 206
        assert len(response.content) == 100
    assert hosted.get('/api/jobs', params={'ticket': grant['ticket']}).status_code == 401
    assert hosted.get(f'/api/jobs/{job_id}/download-ticket', headers={
        **headers(), 'X-FretFlow-Download-Path': '/api/jobs'}).status_code == 400


def test_restart_recovers_pending_job_with_same_owner(hosted):
    job_id = hosted.post('/api/demo', json={}, headers=headers()).json()['id']
    folder = service.jobs[job_id].folder
    assert (folder / 'pending.json').is_file()
    service.jobs.clear()
    service.executor.calls.clear()
    with TestClient(service.app) as restarted:
        assert restarted.get(f'/api/jobs/{job_id}', headers=headers()).status_code == 200
        assert restarted.get(f'/api/jobs/{job_id}', headers=headers('b')).status_code == 404
        assert len(service.executor.calls) == 1
        assert service.executor.calls[0][2] == folder / 'audio.wav'


def test_restart_keeps_completed_record_owner_without_requeue(hosted):
    job_id = hosted.post('/api/demo', json={}, headers=headers()).json()['id']
    job = service.jobs[job_id]
    job.result = {'name': job.name, 'mode': job.mode, 'sensitivity': job.sensitivity, 'created': job.created}
    service.save_result(job)
    assert not (job.folder / 'pending.json').exists()
    service.jobs.clear()
    service.executor.calls.clear()
    with TestClient(service.app) as restarted:
        assert restarted.get(f'/api/jobs/{job_id}', headers=headers()).json()['status'] == 'done'
        assert restarted.get(f'/api/jobs/{job_id}', headers=headers('b')).status_code == 404
        assert service.executor.calls == []
