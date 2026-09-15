"""Freeze the v1 rule before fetching six new GuitarSet validation recordings."""
import hashlib
import json
from pathlib import Path
import zlib

from fetch_guitarset_regression import Archive

PROJECT = Path(__file__).resolve().parent.parent
ROOT = PROJECT / "verification" / "transcription-quality" / "validation"
ROOT.mkdir(parents=True, exist_ok=True)
rule_sha = hashlib.sha256((PROJECT / "backend" / "refinement.py").read_bytes()).hexdigest()
freeze = ROOT / "rule-freeze.json"
if freeze.exists():
    assert json.loads(freeze.read_text())["sha256"] == rule_sha, "The rule changed after freezing"
else:
    freeze.write_text(json.dumps({"file": "backend/refinement.py", "sha256": rule_sha,
                                 "selection": "Players 01 Funk, 03 Rock, 05 SS; second sorted comp and solo track each",
                                 "development_players": ["00", "02", "04"]}, indent=2))
audio, annotations = Archive("audio_mono-mic.zip"), Archive("annotation.zip")
items = []
for player, style in [(1, "Funk"), (3, "Rock"), (5, "SS")]:
    for mode in ["comp", "solo"]:
        filename = sorted(n for n in audio.files if n.startswith(f"{player:02}_{style}") and n.endswith(f"_{mode}_mic.wav"))[1]
        clip_id = filename.removesuffix("_mic.wav")
        print("New validation recording:", clip_id, flush=True)
        wave, jams = ROOT / filename, ROOT / f"{clip_id}.jams"
        for archive, name, path in [(audio, filename, wave), (annotations, jams.name, jams)]:
            if not path.exists(): path.write_bytes(archive.extract(name))
            raw = path.read_bytes()
            assert len(raw) == archive.files[name].file_size and zlib.crc32(raw) == archive.files[name].CRC
        notes = sorted([{"start": float(n["time"]), "end": float(n["time"] + n["duration"]), "midi": float(n["value"])}
                        for a in json.loads(jams.read_text())["annotations"] if a["namespace"] == "note_midi"
                        for n in a["data"] if n["duration"] > 0], key=lambda n: (n["start"], n["midi"]))
        ref = ROOT / f"{clip_id}.reference.json"
        ref.write_text(json.dumps(notes, indent=2))
        items.append({"id": clip_id, "group": mode, "audio": wave.name, "reference": ref.name,
                      "audio_sha256": hashlib.sha256(wave.read_bytes()).hexdigest(),
                      "reference_sha256": hashlib.sha256(ref.read_bytes()).hexdigest()})
manifest = {"dataset": "GuitarSet 1.1.0 / six new clips for frozen release-fusion-v1 validation",
            "source": "https://zenodo.org/records/3371780", "license": "CC-BY-4.0",
            "attribution": "Qingyang Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye, Juan P. Bello (2018), GuitarSet",
            "limitations": ["New clips for the frozen postprocessing rule, not independent unseen data for the pretrained models.",
                           "Development uses players 00/02/04; validation uses 01/03/05. Other recordings of these musicians were in the earlier baseline comparison.",
                           "Clean acoustic guitar only; small sample; no manual re-audit of dataset annotations; not release approval."],
            "rule_sha256": rule_sha, "clips": items}
(ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
