"""Isolated candidate evaluation; does not change the application's engine."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent / "verification" / "transcription-quality"
sys.path[:0] = [str(ROOT / "piano-inference"), str(ROOT / "eval-deps")]
import librosa
import torch
from piano_transcription_inference import PianoTranscription

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--manifest", type=Path, default=ROOT / "manifest.json")
parser.add_argument("--output", type=Path, default=ROOT / "gaps-predictions")
args = parser.parse_args()
checkpoint = ROOT / "guitar-gaps.pth"
sha = "65483e7c0e340a90415b15b520687587698c8c728f5fa470a205f13ee45c6513"
assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == sha
torch.set_num_threads(2)
engine = PianoTranscription("Regress_onset_offset_frame_velocity_CRNN", checkpoint_path=str(checkpoint),
                            device="cpu", batch_size=1)
# Upstream loads with strict=False; require complete weights for this evaluation.
state = torch.load(checkpoint, map_location="cpu", weights_only=False)
engine.model.load_state_dict(state["model"], strict=True)
engine.model.eval()
output = args.output
output.mkdir(parents=True, exist_ok=True)
manifest = json.loads(args.manifest.read_text())
rows = []
for item in manifest["clips"]:
    started = time.perf_counter()
    samples, sr = librosa.load(args.manifest.parent / item["audio"], sr=16000)
    duration = len(samples) / sr
    with torch.inference_mode(): result = engine.transcribe(samples, None)
    notes = [{"start": max(0., float(n["onset_time"])), "end": min(duration, float(n["offset_time"])),
              "midi": int(n["midi_note"]), "velocity": int(n["velocity"])}
             for n in result["est_note_events"]
             if n["offset_time"] > max(0., n["onset_time"]) and n["onset_time"] < duration]
    notes.sort(key=lambda n: (n["start"], n["midi"]))
    (output / f'{item["id"]}.json').write_text(json.dumps(notes, indent=2))
    rows.append({"id": item["id"], "notes": len(notes), "inference_seconds": time.perf_counter() - started})
    print(rows[-1], flush=True)
(output / "provenance.json").write_text(json.dumps({
    "source": "https://huggingface.co/xavriley/midi-transcription-models/blob/main/guitar-gaps.pth",
    "manifest_sha256": hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
    "checkpoint_sha256": sha, "strict_load": True, "device": "cpu", "threads": 2,
    "inference_repo": "https://github.com/xavriley/piano_transcription_inference",
    "inference_commit": subprocess.check_output(["git", "-C", str(ROOT / "piano-inference"), "rev-parse", "HEAD"], text=True).strip(),
    "thresholds": {"onset": .3, "offset": .3, "frame": .1}, "clips": rows
}, indent=2))
