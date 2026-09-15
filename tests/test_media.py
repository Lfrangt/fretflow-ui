import subprocess
import numpy as np
import soundfile as sf
import backend.app as service
from test_api import client, completed_job


def test_video_extract_trim_and_reject_no_audio(client, tmp_path, monkeypatch):
    source = tmp_path / 'tone.wav'
    sf.write(source, np.sin(2*np.pi*440*np.arange(44100*2)/44100)*.2, 44100)
    video = tmp_path / 'guitar.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=64x64:r=10','-i',str(source),'-t','2','-c:v','libx264','-c:a','aac',str(video)],check=True)
    seen = []
    def analyze(path, mode, sensitivity, progress):
        info = sf.info(path)
        seen.append(info)
        return {'duration':info.duration,'notes':[], 'chords':[]}
    monkeypatch.setattr(service, 'analyze', analyze)
    response = client.post('/api/analyze', files={'file':('guitar.MP4',video.read_bytes(),'video/mp4')}, data={'clip_start':'.5','clip_end':'1.5'})
    assert response.status_code == 202
    job = service.jobs[response.json()['id']]
    service.work(job, job.folder/'input.mp4')
    assert job.status == 'done' and seen[0].samplerate == 22050 and seen[0].channels == 1
    assert abs(seen[0].duration - 1) < .01 and job.result['clip_start'] == .5
    assert not (job.folder/'input.mp4').exists()
    export = client.get(f'/api/jobs/{job.id}/export/source.mp3')
    assert export.status_code == 200 and export.headers['content-type'] == 'audio/mpeg'
    silent = tmp_path/'silent.mov'
    subprocess.run(['ffmpeg','-v','error','-i',str(video),'-an','-c:v','copy',str(silent)],check=True)
    response = client.post('/api/analyze', files={'file':('silent.mov',silent.read_bytes())})
    job = service.jobs[response.json()['id']]
    service.work(job, job.folder/'input.mov')
    assert job.status == 'error' and '没有可读取的音轨' in job.error
    assert not job.folder.exists()


def test_clip_validation_and_revisioned_note_edits(client):
    assert client.post('/api/analyze',files={'file':('video.mp4',b'x')},data={'clip_start':5,'clip_end':3}).status_code == 422
    job = completed_job()
    path = f'/api/jobs/{job.id}'
    response = client.patch(path,json={'revision':0,'note':{'index':0,'midi':62,'start':.2,'end':.9}})
    assert response.status_code == 200 and response.json()['notes'][0]['name'] == 'D4'
    assert response.json()['notes'][0]['original']['midi'] == 60
    xml = client.get(path+'/export/score.musicxml')
    assert xml.status_code == 200 and '<step>D</step>' in xml.text
    assert client.patch(path,json={'revision':1,'note':{'index':0,'midi':62,'start':.5,'end':.2}}).status_code == 422
    assert client.patch(path,json={'revision':1,'score_settings':{'bpm':120,'offset':5}}).status_code == 422
    response = client.patch(path,json={'revision':1,'note':{'index':0,'midi':62,'start':.2,'end':.9,'excluded':True}})
    assert response.json()['notes'][0]['excluded']
    assert client.get(path+'/score').json()['assigned_count'] == 0
