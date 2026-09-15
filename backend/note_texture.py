"""Experimental second-voice review; no monophonic or top-N constraint.

Both inputs are estimates. A second guitar model can corroborate a separate
attack, but disagreement is not proof. Every proposed removal stays reversible.
This module is deliberately not enabled in the default transcription pipeline.
"""
from copy import deepcopy
import math

import numpy as np
from scipy.optimize import linear_sum_assignment

VERSION = "second-voice-review-v1"
ATTACK_WINDOW = .04
MATCH_WINDOW = .08
HARMONIC_INTERVALS = (12, 19, 24)


def _valid(note):
    return (not note.get("excluded") and
            all(math.isfinite(note.get(k, float("nan"))) for k in ("start", "end", "midi")) and
            note["start"] >= 0 and note["end"] > note["start"])


def _manual(note):
    return note.get("edited") or note.get("added")


def _matches(primary, secondary):
    matches = {}
    for pitch in {n["midi"] for n in primary if _valid(n)}:
        left = [i for i, n in enumerate(primary) if _valid(n) and n["midi"] == pitch]
        right = [i for i, n in enumerate(secondary) if _valid(n) and n["midi"] == pitch]
        if not right:
            continue
        delta = np.array([[abs(primary[i]["start"] - secondary[j]["start"]) for j in right] for i in left])
        rows, cols = linear_sum_assignment(np.where(delta <= MATCH_WINDOW, delta, max(len(left), len(right)) + 1))
        for row, col in zip(rows, cols):
            if delta[row, col] <= MATCH_WINDOW:
                matches[left[row]] = right[col]
    return matches


def review_second_voices(notes, guitar_notes):
    """Return original candidates, reversible proposed edits and attack groups.

    An octave by itself never causes exclusion. A corroborated second attack
    always survives, including true octave double stops. Older ringing notes
    are recorded separately from new attacks.
    """
    output = deepcopy(notes)
    matches = _matches(notes, guitar_notes)
    decisions = []
    order = sorted((i for i, n in enumerate(notes) if _valid(n)), key=lambda i: (notes[i]["start"], notes[i]["midi"]))
    for i in order:
        note = notes[i]
        if i in matches or _manual(note):
            continue
        # An existing string may still ring when another string is plucked.
        # Join only adjacent same-pitch pieces backed by the other model's
        # ongoing note and a separately corroborated attack on another pitch.
        previous = [j for j in order if j != i and notes[j]["midi"] == note["midi"] and
                    notes[j]["start"] < note["start"] and j in matches and
                    not _manual(notes[j]) and not output[j].get("excluded") and
                    abs(notes[j]["end"] - note["start"]) <= .04]
        other_attack = any(j in matches and notes[j]["midi"] != note["midi"] and
                           abs(notes[j]["start"] - note["start"]) <= ATTACK_WINDOW for j in order)
        prior = max(previous, key=lambda j: notes[j]["start"]) if previous else None
        if (prior is not None and other_attack and
                guitar_notes[matches[prior]]["end"] >= note["start"] - .05 and
                note.get("activation", 1) <= notes[prior].get("activation", 0) * .85):
            output[prior].setdefault("texture_original_end", output[prior]["end"])
            output[prior]["end"] = max(output[prior]["end"], note["end"])
            output[i]["excluded"] = True
            output[i]["texture_reason"] = "sustain_continuation_candidate"
            decisions.append({"index": i, "parent_index": prior, "reason": output[i]["texture_reason"]})
            continue
        # Require corroboration of the lower note, lack of a matching upper
        # attack, and a comparatively weak upper candidate. Never process
        # hand-corrected notes or force a maximum simultaneous-note count.
        parents = []
        for j in order:
            low = notes[j]
            if j not in matches or output[j].get("excluded") or note["midi"] - low["midi"] not in HARMONIC_INTERVALS:
                continue
            reference = guitar_notes[matches[j]]
            if (low["start"] - MATCH_WINDOW <= note["start"] < low["end"] and
                    reference["start"] - MATCH_WINDOW <= note["start"] < reference["end"] and
                    note.get("activation", 1) <= min(.5, low.get("activation", 0) * .8)):
                parents.append(j)
        if parents:
            parent = max(parents, key=lambda j: notes[j].get("activation", 0))
            output[i]["excluded"] = True
            output[i]["texture_reason"] = "harmonic_candidate"
            decisions.append({"index": i, "parent_index": parent, "reason": "harmonic_candidate"})

    groups = []
    for i in order:
        if output[i].get("excluded"):
            continue
        if not groups or notes[i]["start"] - groups[-1]["start"] > ATTACK_WINDOW:
            groups.append({"start": notes[i]["start"], "note_indices": []})
        groups[-1]["note_indices"].append(i)
    for group in groups:
        members = group["note_indices"]
        supported = all(i in matches or _manual(notes[i]) for i in members)
        count = len({notes[i]["midi"] for i in members})
        group["type"] = ("single_attack" if count == 1 else "double_attack" if count == 2 else "multiple_attack") if supported else "uncertain_attack"
        group["ringing_indices"] = [i for i in order if i not in members and not output[i].get("excluded") and
                                    output[i]["start"] < group["start"] and output[i]["end"] > group["start"]]
        group["status"] = "model_estimate"
    return {"version": VERSION, "notes": deepcopy(notes), "proposed_notes": output,
            "decisions": decisions, "proposed_groups": groups,
            "corroborated_indices": sorted(matches), "release_approved": False,
            "policy": {"attack_window_ms": ATTACK_WINDOW * 1000, "match_window_ms": MATCH_WINDOW * 1000,
                       "manual_edits_preserved": True, "maximum_polyphony": None,
                       "disagreement_is_not_ground_truth": True}}
