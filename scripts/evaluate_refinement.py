"""Apply and measure the frozen release correction on a labelled audio manifest."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.refinement import refine_releases
from scripts.benchmark_transcription import aggregate, compare, digest

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("manifest", type=Path)
parser.add_argument("--primary", type=Path, required=True)
parser.add_argument("--secondary", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text())
code_sha = digest(Path(__file__).resolve().parent.parent / "backend" / "refinement.py")
if "rule_sha256" in manifest and code_sha != manifest["rule_sha256"]:
    raise RuntimeError("The refinement rule changed after the validation set was selected")
args.output.mkdir(parents=True, exist_ok=True)
report = {"manifest_sha256": digest(args.manifest), "rule_sha256": code_sha,
          "limitations": manifest.get("limitations", []), "release_approved": False, "clips": []}
for item in manifest["clips"]:
    wave, reference = args.manifest.parent / item["audio"], args.manifest.parent / item["reference"]
    assert digest(wave) == item["audio_sha256"] and digest(reference) == item["reference_sha256"]
    primary = json.loads((args.primary / f'{item["id"]}.json').read_text())
    secondary = json.loads((args.secondary / f'{item["id"]}.json').read_text())
    truth = json.loads(reference.read_text())
    result = refine_releases(primary, secondary, duration=sf.info(wave).duration)
    (args.output / f'{item["id"]}.json').write_text(json.dumps(result["notes"], indent=2))
    (args.output / f'{item["id"]}.evidence.json').write_text(json.dumps(result, indent=2))
    scores = {name: compare(truth, notes) for name, notes in [("basic_pitch", secondary), ("gaps", primary), ("refined", result["notes"])]}
    report["clips"].append({"id": item["id"], "group": item["group"], "changed_releases": result["changed_count"], "scores": scores})
    print(item["id"], {name: round(s["pitch_onset_offset"]["f1"], 4) for name, s in scores.items()}, flush=True)
report["micro"] = {engine: aggregate([{"metrics": c["scores"][engine]} for c in report["clips"]]) for engine in ["basic_pitch", "gaps", "refined"]}
(args.output / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report["micro"], indent=2))
