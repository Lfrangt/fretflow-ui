"""A reviewable rhythm/fingering draft, serialized to standard MusicXML.

Engraving belongs to alphaTab/MuseScore. This module only builds musical data:
sixteenth-note quantization, bounded guitar positions, rests and tied sustains.
It does not infer technique, meter, original fingering, or instrument separation.
"""
from __future__ import annotations

import math
from pathlib import Path
import xml.etree.ElementTree as ET

TUNINGS = {"standard": [64, 59, 55, 50, 45, 40], "drop-d": [64, 59, 55, 50, 45, 38]}
STEPS = [("C", 0), ("C", 1), ("D", 0), ("D", 1), ("E", 0), ("F", 0),
         ("F", 1), ("G", 0), ("G", 1), ("A", 0), ("A", 1), ("B", 0)]
KINDS = {"maj": "major", "min": "minor", "7": "dominant", "maj7": "major-seventh",
         "min7": "minor-seventh", "minmaj7": "major-minor", "dim": "diminished",
         "dim7": "diminished-seventh", "hdim7": "half-diminished", "aug": "augmented",
         "maj6": "major-sixth", "min6": "minor-sixth", "sus2": "suspended-second", "sus4": "suspended-fourth"}
NOTATION_BETA_NOTICE = (
    "Beta: Notes, rhythms and fingerings may be inaccurate. For reference only; "
    "note-for-note reproduction is not guaranteed. We are working to improve accuracy. "
    "五线谱与六线谱 Beta：音符、节奏和指法可能不准确，仅供参考；"
    "目前无法保证逐音复刻，我们正在持续提高准确度。"
)


def defaults(result):
    return {"bpm": result.get("tempo", {}).get("bpm") or 120, "meter": "4/4", "offset": 0.,
            "capo": 0, "tuning": "standard", "fret_min": 5, "fret_max": 12, **result.get("score_settings", {})}


def child(parent, name, value=None, **attrs):
    node = ET.SubElement(parent, name, {k: str(v) for k, v in attrs.items()})
    if value is not None:
        node.text = str(value)
    return node


def pitch(parent, midi, prefix=""):
    step, alter = STEPS[midi % 12]
    child(parent, prefix + "step", step)
    if alter:
        child(parent, prefix + "alter", alter)
    child(parent, prefix + "octave", midi // 12 - 1)


def assign_notes(result, settings):
    tick_seconds = 60 / settings["bpm"] / 4
    tuning = TUNINGS[settings["tuning"]]
    grouped = {}
    omitted = []
    for index, note in enumerate(result["notes"]):
        if note.get("excluded"):
            continue
        if note["end"] <= settings["offset"]:
            omitted.append(index)
            continue
        start = max(0, round((note["start"] - settings["offset"]) / tick_seconds))
        end = max(start + 1, round((note["end"] - settings["offset"]) / tick_seconds))
        candidates = [(string + 1, note["midi"] - open_pitch - settings["capo"])
                      for string, open_pitch in enumerate(tuning)
                      if 0 <= note["midi"] - open_pitch - settings["capo"] <= 24 - settings["capo"]]
        if not candidates:
            omitted.append(index)
            continue
        grouped.setdefault(start, []).append({**note, "index": index, "a": start, "b": end, "candidates": candidates})
    assigned = []
    active = {}
    fret_min, fret_max = settings.get("fret_min", 5), settings.get("fret_max", 12)
    position = (fret_min + fret_max) / 2
    shortened = 0
    for start, notes in sorted(grouped.items()):
        # Keep strongest detections if more than six simultaneous attacks exist.
        notes.sort(key=lambda n: (-n.get("activation", 1), n["midi"]))
        omitted.extend(n["index"] for n in notes[6:])
        notes = notes[:6]
        # Small beam search prevents a greedy first note from occupying the only
        # available string for another pitch in the same chord.
        beam = [(0., [])]
        for note in notes:
            next_beam = []
            for cost, placements in beam:
                for string, fret in note["candidates"]:
                    if any(p["string"] == string for p in placements):
                        continue
                    frets = [p["fret"] for p in placements if p["fret"]] + ([fret] if fret else [])
                    span = max(frets, default=0) - min(frets, default=0)
                    if span > 5:
                        continue
                    collision = string in active and active[string]["b"] > start
                    # Range is a preference: keep reachable basses and their exact
                    # octaves even when no string can place them in the chosen range.
                    outside = max(fret_min - fret, 0, fret - fret_max)
                    range_cost = 10 + outside * .12 if outside else 0
                    score = cost + range_cost + abs(fret - position) * .2 + span * .5 + (4 if collision else 0)
                    next_beam.append((score, placements + [{**note, "string": string, "fret": fret}]))
                # An unplayable simultaneous detection remains in the note list
                # and is explicitly reported, never silently octave-shifted.
                next_beam.append((cost + 100, placements))
            beam = sorted(next_beam, key=lambda item: item[0])[:48]
        placements = beam[0][1]
        used = {n["index"] for n in placements}
        omitted.extend(n["index"] for n in notes if n["index"] not in used)
        for note in placements:
            prior = active.get(note["string"])
            if prior and prior["b"] > start:
                prior["b"] = start
                shortened += 1
            active[note["string"]] = note
            assigned.append(note)
        fretted = [n["fret"] for n in placements if n["fret"]]
        if fretted:
            position = sum(fretted) / len(fretted)
    return assigned, sorted(set(omitted)), shortened, tick_seconds


def _build_single_score(result):
    settings = defaults(result)
    assigned, omitted, shortened, tick_seconds = assign_notes(result, settings)
    beats = int(settings["meter"][0])
    bar_ticks = beats * 4
    total_ticks = max(1, math.ceil(max(0, result["duration"] - settings["offset"]) / tick_seconds))
    bars = max(1, math.ceil(total_ticks / bar_ticks))
    root = ET.Element("score-partwise", version="4.0")
    work = child(root, "work")
    child(work, "work-title", Path(result.get("name", "FretFlow")).stem[:40] + " · Beta")
    child(root, "movement-title", "Beta · Notes may be inaccurate · For reference only / 音符可能不准，仅供参考")
    identification = child(root, "identification")
    child(identification, "creator", "FretFlow · Beta", type="composer")
    miscellaneous = child(identification, "miscellaneous")
    child(miscellaneous, "miscellaneous-field", NOTATION_BETA_NOTICE).set("name", "transcription-accuracy")
    parts = child(root, "part-list")
    definition = child(parts, "score-part", id="P1")
    child(definition, "part-name", "Guitar")
    instrument = child(definition, "score-instrument", id="I1")
    child(instrument, "instrument-name", "Acoustic Guitar")
    midi = child(definition, "midi-instrument", id="I1")
    child(midi, "midi-channel", 1)
    child(midi, "midi-program", 25)
    part = child(root, "part", id="P1")
    chord_ticks = {}
    for chord in result.get("chords", []):
        if chord.get("root") is not None and chord["end"] > settings["offset"]:
            tick = max(0, round((chord["start"] - settings["offset"]) / tick_seconds))
            chord_ticks[tick] = chord
    for bar in range(bars):
        left, right = bar * bar_ticks, (bar + 1) * bar_ticks
        measure = child(part, "measure", number=bar + 1)
        if bar == 0:
            attributes = child(measure, "attributes")
            child(attributes, "divisions", 4)
            time = child(attributes, "time")
            child(time, "beats", beats)
            child(time, "beat-type", 4)
            clef = child(attributes, "clef")
            child(clef, "sign", "TAB")
            child(clef, "line", 5)
            details = child(attributes, "staff-details")
            child(details, "staff-lines", 6)
            for line, open_pitch in enumerate(reversed(TUNINGS[settings["tuning"]]), 1):
                pitch(child(details, "staff-tuning", line=str(line)), open_pitch, "tuning-")
            child(details, "capo", settings["capo"])
            direction = child(measure, "direction", placement="above")
            dt = child(direction, "direction-type")
            metronome = child(dt, "metronome")
            child(metronome, "beat-unit", "quarter")
            child(metronome, "per-minute", settings["bpm"])
            child(direction, "sound", tempo=str(settings["bpm"]))
        local_notes = [n for n in assigned if n["a"] < right and n["b"] > left]
        boundaries = sorted({left, right, *[max(left, n["a"]) for n in local_notes],
                             *[min(right, n["b"]) for n in local_notes],
                             *[t for t in chord_ticks if left <= t < right]})
        for a, b in zip(boundaries, boundaries[1:]):
            sounding = sorted([n for n in local_notes if n["a"] <= a < n["b"]], key=lambda n: n["midi"])
            cursor = a
            while cursor < b:
                if cursor in chord_ticks:
                    chord = chord_ticks[cursor]
                    harmony = child(measure, "harmony")
                    chord_root = child(harmony, "root")
                    step, alter = STEPS[chord["root"]]
                    child(chord_root, "root-step", step)
                    if alter:
                        child(chord_root, "root-alter", alter)
                    # MusicXML kind text is the quality suffix; the root is
                    # already emitted above. A full label would render as AA.
                    root_name = step + ("#" if alter else "")
                    suffix = chord["label"].removeprefix(root_name).split("/")[0]
                    child(harmony, "kind", KINDS.get(chord["quality"], "other"), text=suffix)
                # Split at beat boundaries for legible beaming, then powers of 2.
                available = min(b - cursor, 4 - cursor % 4)
                ticks = max(t for t in (1, 2, 3, 4) if t <= available)
                for i, note in enumerate(sounding or [None]):
                    node = child(measure, "note")
                    if i:
                        child(node, "chord")
                    if note:
                        pitch(child(node, "pitch"), note["midi"])
                    else:
                        child(node, "rest")
                    child(node, "duration", ticks)
                    ties = [] if not note else (["stop"] if cursor > note["a"] else []) + (["start"] if cursor + ticks < note["b"] else [])
                    for tie in ties:
                        child(node, "tie", type=tie)
                    child(node, "voice", 1)
                    child(node, "type", {1: "16th", 2: "eighth", 3: "eighth", 4: "quarter"}[ticks])
                    if ticks == 3:
                        child(node, "dot")
                    if note:
                        notation = child(node, "notations")
                        for tie in ties:
                            child(notation, "tied", type=tie)
                        technical = child(notation, "technical")
                        child(technical, "string", note["string"])
                        child(technical, "fret", note["fret"])
                cursor += ticks
    notices = ["六线谱指位是按可演奏性推算的建议，不代表视频里的原始指法。",
               "节奏按十六分音符对齐；拍号、第一拍偏移和速度需要回听校正，暂不自动记连音、滑音、击勾弦或推弦。"]
    if omitted:
        notices.append(f"{len(omitted)} 个音未进入六线谱（片段起点之前、音域或同时指位限制）；原始音符和 MIDI 仍保留。")
    if shortened:
        notices.append(f"为避免同弦重叠，{shortened} 处延音在下一次拨弦处截断。")
    return {"musicxml": ET.tostring(root, encoding="utf-8", xml_declaration=True).decode(),
            "settings": settings, "notices": notices, "assigned_count": len(assigned),
            "omitted_indices": omitted, "bar_count": bars}


def build_score(result):
    """Keep human-assigned guitars independent, including fingering and sustains."""
    if not any(note.get("track", 1) == 2 for note in result["notes"]):
        return _build_single_score(result)
    drafts = []
    for track in (1, 2):
        scoped = {**result, "notes": [{**note, "excluded": note.get("excluded", False) or note.get("track", 1) != track}
                                     for note in result["notes"]]}
        if track == 2:
            scoped["chords"] = []  # The shared harmony belongs to the score, not an inferred second guitar.
        draft = _build_single_score(scoped)
        root = ET.fromstring(draft["musicxml"])
        definition = root.find("part-list/score-part")
        definition.set("id", f"P{track}")
        definition.find("part-name").text = f"Guitar {track}"
        for node in definition.findall("score-instrument") + definition.findall("midi-instrument"):
            node.set("id", f"I{track}")
        definition.find("midi-instrument/midi-channel").text = str(track)
        root.find("part").set("id", f"P{track}")
        drafts.append((draft, root))
    draft, root = drafts[0]
    second, second_root = drafts[1]
    root.find("part-list").append(second_root.find("part-list/score-part"))
    root.append(second_root.find("part"))
    draft["musicxml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True).decode()
    draft["assigned_count"] += second["assigned_count"]
    draft["omitted_indices"] = sorted(draft["omitted_indices"] + second["omitted_indices"])
    draft["notices"] = ["Manual guitar assignments are preserved in separate score and MIDI tracks; this does not separate the source audio."] + [
        f"Guitar {track}: {notice}" for track, (item, _) in enumerate(drafts, 1) for notice in item["notices"]]
    return draft
