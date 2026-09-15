import type { Transcription } from "./transcription";

/** Keep the imported performance separate from the suggested chord shapes. */
export function practicePerformance(result: Transcription) {
  const offset = Math.max(0, Math.min(result.score_settings.offset, result.duration));
  return {
    originalUrl: result.id ? `/api/transcription/jobs/${encodeURIComponent(result.id)}/audio` : null,
    offset,
    sourceStart: result.clip_start || 0,
    tuning: result.score_settings.tuning ?? "standard",
    duration: result.duration - offset,
    bpm: result.score_settings.bpm,
    notes: result.notes.filter(note => !note.excluded && note.end > offset).map(note => ({
      ...note, start: Math.max(0, note.start - offset), end: Math.min(result.duration, note.end) - offset
    })),
    chords: result.chords.filter(chord => chord.root !== null && chord.end > offset).map(chord => ({
      start: Math.max(0, chord.start - offset), end: chord.end - offset
    }))
  };
}

export type PracticePerformance = ReturnType<typeof practicePerformance>;

export function chordAtTime(data: PracticePerformance, time: number) {
  return data.chords.findIndex(chord => time >= chord.start && time < chord.end);
}

export function practiceRange(data: PracticePerformance, loop: "full" | "pair" | "hold", loopStart: number) {
  if (loop === "full") return { start: 0, end: data.duration };
  const index = Math.max(0, Math.min(loopStart, data.chords.length - 1));
  return {
    start: data.chords[index]?.start ?? 0,
    end: data.chords[Math.min(data.chords.length - 1, index + (loop === "pair" ? 1 : 0))]?.end ?? data.duration
  };
}

export function soundingMidi(data: PracticePerformance, time: number) {
  return [...new Set(data.notes.filter(note => note.start <= time && time < note.end).map(note => note.midi))].sort((a, b) => a - b);
}

export function midiName(midi: number) {
  return ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][midi % 12] + (Math.floor(midi / 12) - 1);
}

/** Pitch-correct positions. Prefer the chosen range without changing octaves or dropping reachable pitches. */
export function notePositions(midis: number[], tuning: "standard" | "drop-d" = "standard", range = { min: 0, max: 12 }) {
  const open = [0, 64, 59, 55, 50, 45, tuning === "drop-d" ? 38 : 40];
  const positionCost = (fret: number) => {
    if (fret >= range.min && fret <= range.max) return Math.abs(fret - (range.min + range.max) / 2);
    // An open bass does not pull the fretting hand away from the upper neck.
    if (fret === 0) return 12;
    return 100 + Math.max(range.min - fret, fret - range.max) + Math.abs(fret - (range.min + range.max) / 2);
  };
  type Placement = { string: number; fret: number; midi: number };
  let states = new Map<number, { cost: number; notes: Placement[] }>([[0, { cost: 0, notes: [] }]]);
  // Optimize all strings together. Greedy reassignment could displace a note
  // from fret 12 to fret 7 even when an open bass leaves both pitches playable.
  for (const midi of [...new Set(midis)].sort((a, b) => a - b)) {
    const candidates = [1, 2, 3, 4, 5, 6].map(string => ({ string, fret: midi - open[string], midi }))
      .filter(p => p.fret >= 0 && p.fret <= 21);
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
