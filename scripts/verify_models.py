"""Actual neural inference checks, using original synthetic signals, not mocks."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import json
import tempfile
import numpy as np
import soundfile as sf
from backend.analysis import analyze, SR
from backend.demo import make_demo

report={"scope":"Synthetic integration checks only; not real-recording accuracy", "checks":{}}
with tempfile.TemporaryDirectory() as folder:
    path=Path(folder)/'audio.wav'
    progress=lambda p,s:print(f'{p}% {s}',flush=True)
    sf.write(path,make_demo('harmony'),SR)
    r=analyze(path,'both',.5,progress)
    expected=['C','Am','F','G']
    matches=[]
    for sec,label in zip([2,6,10,14],expected):
        actual=next(c['label'] for c in r['chords'] if c['start']<=sec<c['end'])
        matches.append(actual==label)
    assert all(matches),r['chords']
    assert len(r['notes'])>20
    assert all(0<=c['start']<c['end']<=r['duration'] for c in r['chords'])
    report['checks']['chord_progression']={"expected":expected,"segments":[{"start":c['start'],"end":c['end'],"chord":c['label']} for c in r['chords']],"notes":len(r['notes']),"seconds":r['analysis_seconds']}
    sf.write(path,make_demo('melody'),SR)
    r=analyze(path,'notes',.5,progress)
    melody=[60,62,64,67,69,67,64,62,60]
    detected=[]
    for i in range(9):
        candidates=[n for n in r['notes'] if n['start']<=i+.55<n['end']]
        detected.append(max(candidates,key=lambda n:n['activation'])['midi'] if candidates else None)
    assert detected==melody,detected
    report['checks']['monophonic_melody']={"expected_midi":melody,"detected_midi":detected,"notes":len(r['notes']),"seconds":r['analysis_seconds']}
    sf.write(path,np.zeros(SR*2),SR)
    r=analyze(path,'both',.5,progress)
    assert not r['chords'] and not r['notes'] and r['key']['root'] is None
    report['checks']['silence']="No fabricated notes or chords"
Path('verification').mkdir(exist_ok=True)
Path('verification/model-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
