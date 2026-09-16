import sys, time, json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
import torch, soundfile as sf
from backend.vocal_removal import vocal_model
from demucs.apply import apply_model
source=Path(sys.argv[1])
audio,rate=sf.read(source,frames=44100*24,dtype='float32',always_2d=True)
model=vocal_model()
mix=torch.from_numpy(audio.T.copy())
ref=mix.mean(0)
mean,scale=ref.mean(),ref.std()
reference=None
rows=[]
for threads in [2,4,8,1,2]:
    torch.set_num_threads(threads)
    started=time.monotonic()
    with torch.inference_mode():
        output=apply_model(model,((mix-mean)/scale)[None],shifts=0,split=True,overlap=.25,device='cpu',num_workers=0)[0]
    elapsed=time.monotonic()-started
    difference=0. if reference is None else float((output-reference).abs().max())
    if reference is None: reference=output.clone()
    row=dict(threads=threads,seconds=round(elapsed,3),max_abs_difference=difference)
    rows.append(row)
    print(json.dumps(row),flush=True)
(root/'.runtime/performance-probe.json').write_text(json.dumps(rows))
