import type { Transcription } from "./transcription";

/** Keep the imported performance separate from the suggested chord shapes. */
export function practicePerformance(result: Transcription) {
  const offset = Math.max(0, Math.min(result.score_settings.offset, result.duration));
  const notes = result.notes.filter(note => !note.excluded &&
    [note.start, note.end, note.midi].every(Number.isFinite) && Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127 &&
    note.start >= 0 && note.end > note.start && note.end > offset && note.start < result.duration).map(note => ({
    ...note, start: Math.max(0, note.start - offset), end: Math.min(result.duration, note.end) - offset
  })).filter(note => note.end > note.start).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const detectedChords = result.chords.filter(chord => chord.root !== null && chord.end > offset && chord.start < result.duration);
  const chords = detectedChords.map(chord => ({ start: Math.max(0, chord.start - offset), end: Math.min(result.duration, chord.end) - offset }));
  const timelineKind = result.mode === "solo" || (!chords.length && (notes.length > 0 || result.mode === "notes")) ? "notes" : "chords";
  // A note timeline is independent of harmony. Simultaneous attacks share one
  // step, while their original durations remain intact in the performance.
  const noteSteps: PracticeStep[] = [];
  for (const note of notes) {
    const previous = noteSteps.at(-1);
    if (previous && Math.abs(previous.start - note.start) < .0001) {
      previous.end = Math.max(previous.end, note.end);
      if (!previous.midis.includes(note.midi)) previous.midis.push(note.midi);
      previous.label = previous.midis.map(midiName).join(" · ");
    } else noteSteps.push({ start: note.start, end: note.end, midis: [note.midi], label: midiName(note.midi) });
  }
  const steps: PracticeStep[] = timelineKind === "notes" ? noteSteps : chords.map((chord, index) => ({ ...chord, label: detectedChords[index].label, midis: [] }));
  return {
    sourceId: result.id,
    revision: result.revision,
    originalUrl: result.id ? `/api/transcription/jobs/${encodeURIComponent(result.id)}/audio` : null,
    offset,
    sourceStart: result.clip_start || 0,
    tuning: result.score_settings.tuning ?? "standard",
    capo: result.score_settings.capo ?? 0,
    duration: result.duration - offset,
    bpm: result.score_settings.bpm,
    notes, chords, steps, timelineKind,
  };
}

export type PracticeStep = { start: number; end: number; label: string; midis: number[] };
export type PracticePerformance = ReturnType<typeof practicePerformance>;

export function chordAtTime(data: PracticePerformance, time: number) {
  return data.chords.findIndex(chord => time >= chord.start && time < chord.end);
}

export function stepAtTime(data: PracticePerformance, time: number) {
  // Latest attack wins when a previous note is still sustaining.
  return data.steps.findLastIndex(step => time >= step.start && time < step.end);
}

export function practiceRange(data: PracticePerformance, loop: "full" | "pair" | "hold", loopStart: number) {
  if (loop === "full") return { start: 0, end: data.duration };
  const index = Math.max(0, Math.min(loopStart, data.steps.length - 1));
  const selected = data.steps.slice(index, index + (loop === "pair" ? 2 : 1));
  return {
    start: selected[0]?.start ?? 0,
    end: selected.length ? Math.min(data.duration, Math.max(...selected.map(step => step.end))) : data.duration
  };
}

export function soundingMidi(data: PracticePerformance, time: number) {
  return [...new Set(data.notes.filter(note => note.start <= time && time < note.end).map(note => note.midi))].sort((a, b) => a - b);
}

export function midiName(midi: number) {
  return ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][midi % 12] + (Math.floor(midi / 12) - 1);
}

/** Pitch-correct positions. Prefer the chosen range without changing octaves or dropping reachable pitches. */
export function notePositions(midis: number[], tuning: "standard" | "drop-d" = "standard", range = { min: 0, max: 12 }, capo = 0) {
  const firstFret = Math.max(0, Math.min(21, Math.round(capo)));
  const open = [0, 64, 59, 55, 50, 45, tuning === "drop-d" ? 38 : 40];
  const positionCost = (fret: number) => {
    if (fret >= range.min && fret <= range.max) return Math.abs(fret - (range.min + range.max) / 2);
    // An open bass does not pull the fretting hand away from the upper neck.
    if (fret === firstFret) return 12;
    return 100 + Math.max(range.min - fret, fret - range.max) + Math.abs(fret - (range.min + range.max) / 2);
  };
  type Placement = { string: number; fret: number; midi: number };
  let states = new Map<number, { cost: number; notes: Placement[] }>([[0, { cost: 0, notes: [] }]]);
  // Optimize all strings together. Greedy reassignment could displace a note
  // from fret 12 to fret 7 even when an open bass leaves both pitches playable.
  for (const midi of [...new Set(midis)].sort((a, b) => a - b)) {
    const candidates = [1, 2, 3, 4, 5, 6].map(string => ({ string, fret: midi - open[string], midi }))
      .filter(p => p.fret >= firstFret && p.fret <= 21);
    const next = new Map<number, { cost: number; notes: Placement[] }>();
    const retain = (mask: number, cost: number, notes: Placement[]) => {
      if (cost < (next.get(mask)?.cost ?? Infinity)) next.set(mask, { cost, notes });
    };
    for (const [mask, state] of states) {
      retain(mask, state.cost + 10000, state.notes);
      for (const p of candidates) {
        const bit = 1 << (p.string - 1);
        if (!(mask & bit)) retain(mask | bit, state.cost + positionCost(p.fret), [...state.notes, p]);
      }
    }
    states = next;
  }
  const best = [...states.values()].sort((a, b) => a.cost - b.cost)[0];
  return best.notes.map(p => ({ ...p, interval: midiName(p.midi), finger: 0 }));
}
