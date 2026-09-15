"""Measure transcription against aligned notes, independently of UI smoke tests.

Manifest paths are relative to the manifest. References are JSON lists with
start/end in seconds and midi pitch. Never align estimates to the reference or
tune thresholds on this benchmark. --predictions accepts another model's JSON
note lists, allowing an identical evaluation of candidate engines.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import mir_eval
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def arrays(notes):
    active = [n for n in notes if not n.get("excluded")]
    intervals = np.array([[n["start"], n["end"]] for n in active], dtype=float).reshape(-1, 2)
    pitches = 440 * 2 ** ((np.array([n["midi"] for n in active], dtype=float) - 69) / 12)
    if not np.isfinite(intervals).all() or not np.isfinite(pitches).all():
        raise ValueError("Non-finite note data")
    if len(intervals) and (np.any(intervals[:, 0] < 0) or np.any(intervals[:, 1] <= intervals[:, 0])):
        raise ValueError("Note times must be non-negative and end after start")
    return intervals, pitches


def rates(reference_count, estimate_count, matches):
    precision = matches / estimate_count if estimate_count else 0.
    recall = matches / reference_count if reference_count else 0.
    return {"reference_notes": reference_count, "estimated_notes": estimate_count,
            "matched_notes": matches, "false_notes": estimate_count - matches,
            "missed_notes": reference_count - matches, "precision": precision,
            "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.}


def compare(reference, estimated):
    ri, rp = arrays(reference)
    ei, ep = arrays(estimated)
    output = {}
    for label, ratio in [("pitch_onset", None), ("pitch_onset_offset", .2)]:
        matches = mir_eval.transcription.match_notes(
            ri, rp, ei, ep, onset_tolerance=.05, pitch_tolerance=50.,
            offset_ratio=ratio, offset_min_tolerance=.05,
        ) if len(ri) and len(ei) else []
        metrics = rates(len(ri), len(ei), len(matches))
        errors = [abs(ri[a, 0] - ei[b, 0]) * 1000 for a, b in matches]
        metrics["matched_onset_mae_ms"] = float(np.mean(errors)) if errors else None
        metrics["matched_onset_p95_ms"] = float(np.percentile(errors, 95)) if errors else None
        output[label] = metrics
    return output


def aggregate(clips):
    return {label: rates(*[sum(c["metrics"][label][field] for c in clips) for field in
                          ["reference_notes", "estimated_notes", "matched_notes"]])
            for label in ["pitch_onset", "pitch_onset_offset"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, help="Directory of <clip-id>.json note lists")
    parser.add_argument("--engine-label", default="Basic Pitch 0.4.0 / app default thresholds")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    report = {"dataset": manifest["dataset"], "source": manifest.get("source"),
              "engine": args.engine_label, "manifest_sha256": digest(args.manifest),
              "criteria": {"pitch_tolerance_cents": 50, "onset_tolerance_ms": 50,
                           "offset_tolerance": "max(50 ms, 20% of reference note duration)",
                           "matching": "one-to-one maximum matching; no timing alignment or tuning"},
              "limitations": manifest.get("limitations", []), "release_approved": False, "clips": []}
    if not args.predictions:
        from backend.engines import recognize_notes
        report["model"] = json.loads((ROOT / "models.lock.json").read_text())["basic_pitch"]
        report["parameters"] = {"onset_threshold": .5, "frame_threshold": .35, "minimum_note_length_ms": 90,
                                "minimum_frequency_hz": 65.4, "maximum_frequency_hz": 2093.}
    for item in manifest["clips"]:
        wave = args.manifest.parent / item["audio"]
        reference = args.manifest.parent / item["reference"]
        for path, field in [(wave, "audio_sha256"), (reference, "reference_sha256")]:
            if digest(path) != item[field]:
                raise ValueError(f"Fixture changed: {path.name}")
        started = time.perf_counter()
        if args.predictions:
            notes = json.loads((args.predictions / f'{item["id"]}.json').read_text())
        else:
            info = sf.info(wave)
            notes = recognize_notes(wave, info.duration, .5, lambda *_: None)
        seconds = time.perf_counter() - started
        (args.output / f'{item["id"]}.json').write_text(json.dumps(notes, indent=2))
        entry = {"id": item["id"], "group": item.get("group", "all"), "seconds": seconds,
                 "metrics": compare(json.loads(reference.read_text()), notes)}
        report["clips"].append(entry)
        report["micro"] = aggregate(report["clips"])
        report["by_group"] = {g: aggregate([c for c in report["clips"] if c["group"] == g])
                              for g in sorted({c["group"] for c in report["clips"]})}
        report["complete"] = len(report["clips"]) == len(manifest["clips"])
        (args.output / "report.json").write_text(json.dumps(report, indent=2))
        m = entry["metrics"]["pitch_onset"]
        print(f'{item["id"]}: P={m["precision"]:.3f} R={m["recall"]:.3f} F1={m["f1"]:.3f} ({seconds:.1f}s)', flush=True)
    print(json.dumps(report["micro"], indent=2))


if __name__ == "__main__":
    main()
