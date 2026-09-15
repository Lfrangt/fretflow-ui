"""Experimental, auditable fusion of guitar attacks and release evidence.

The primary engine owns pitch and attack time. A second audio model contributes
release estimates only for same-pitch, one-to-one attacks within 80 ms. This does
not invent notes, quantize timing, infer technique, or overwrite manual edits.
It is a candidate decoder, not a calibrated confidence or correctness claim.
"""
from __future__ import annotations

from copy import deepcopy
import math

import numpy as np
from scipy.optimize import linear_sum_assignment

VERSION = "release-fusion-v1"
ONSET_WINDOW = .08
MIN_DURATION = .03


def _eligible(note):
    return (not any(note.get(k) for k in ("excluded", "edited", "added"))
            and all(math.isfinite(note[k]) for k in ("start", "end", "midi"))
            and note["start"] >= 0 and note["end"] > note["start"])


def refine_releases(primary: list[dict], secondary: list[dict], *, duration: float) -> dict:
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("A positive audio duration is required")
    refined = deepcopy(primary)
    evidence = []
    matched = set()
    pitches = {n["midi"] for n in primary if _eligible(n)}
    for pitch in sorted(pitches):
        left = [i for i, n in enumerate(primary) if _eligible(n) and n["midi"] == pitch]
        right = [i for i, n in enumerate(secondary) if _eligible(n) and n["midi"] == pitch]
        if not right:
            continue
        distance = np.array([[abs(primary[i]["start"] - secondary[j]["start"]) for j in right] for i in left])
        # Maximize valid one-to-one matches before minimizing onset distance.
        penalty = (max(len(left), len(right)) + 1) * (ONSET_WINDOW + 1)
        cost = np.where(distance <= ONSET_WINDOW, distance, penalty)
        rows, cols = linear_sum_assignment(cost)
        for row, col in zip(rows, cols):
            if distance[row, col] > ONSET_WINDOW:
                continue
            i, j = left[row], right[col]
            end = min(duration, secondary[j]["end"])
            if end <= primary[i]["start"] + MIN_DURATION:
                continue
            matched.add(i)
            changed = abs(end - primary[i]["end"]) > 1e-9
            if changed:
                refined[i]["end"] = end
                # The original is retained for review/undo and audit exports.
                refined[i]["release_original_end"] = primary[i]["end"]
                refined[i]["release_source"] = VERSION
            evidence.append({"index": i, "secondary_index": j, "changed": changed,
                             "attack_difference_ms": float(distance[row, col]) * 1000,
                             "primary_end": primary[i]["end"], "candidate_end": end,
                             "reason": "same-pitch attack matched; secondary audio-model release"})
    unresolved = [i for i, note in enumerate(primary) if _eligible(note) and i not in matched]
    return {"version": VERSION, "notes": refined, "changes": evidence,
            "changed_count": sum(item["changed"] for item in evidence),
            "unmatched_indices": unresolved,
            "policy": {"onset_window_ms": ONSET_WINDOW * 1000, "minimum_duration_ms": MIN_DURATION * 1000,
                       "pitch_and_attacks_changed": False, "manual_edits_preserved": True,
                       "release_approved": False}}
