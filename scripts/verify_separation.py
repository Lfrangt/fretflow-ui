"""Real neural smoke check. Synthetic audio verifies wiring, not song accuracy."""
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from backend.demo import make_demo
from backend.analysis import analyze, SR
from backend.separation import separate_audio, STEMS


def main():
    folder = ROOT / 'verification/separation-smoke'
    folder.mkdir(parents=True, exist_ok=True)
    demo = make_demo('harmony')[:6 * SR]
    audio = resample_poly(demo, 2, 1)
    stereo = np.column_stack([audio, audio * .85])
    source = folder / 'original.wav'
    sf.write(source, stereo, 44100, subtype='FLOAT')
    started = time.monotonic()
    stages = []
    def progress(value, stage):
        stages.append({'progress': value, 'stage': stage})
        print(value, stage, flush=True)
    separation = separate_audio(source, folder / 'stems', progress)
    separation_seconds = time.monotonic() - started
    for stem in STEMS:
        output, sr = sf.read(folder / f'stems/{stem}.wav', always_2d=True)
        assert output.shape == stereo.shape and sr == 44100 and np.isfinite(output).all()
    assert all(a['progress'] <= b['progress'] for a, b in zip(stages, stages[1:]))
    result = analyze(source, 'both', .5, lambda value, stage: print(value, stage, flush=True), notes_path=folder/'stems/guitar.wav')
    assert abs(result['duration'] - len(stereo) / 44100) < .001
    assert all(0 <= n['start'] < n['end'] <= result['duration'] for n in result['notes'])
    report = {'fixture': 'original synthesized guitar, not a real-song quality benchmark',
              'duration': result['duration'], 'separation': separation,
              'separation_seconds': round(separation_seconds, 2),
              'chords': len(result['chords']), 'notes': len(result['notes']),
              'stereo_and_duration_checks': 'passed', 'warnings': result['warnings']}
    (folder/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
