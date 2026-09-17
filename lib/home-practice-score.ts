import { notePositions } from "./practice-performance";
import type { FretRange } from "./guitar-voicing";

/** All times are seconds on the existing, already offset-relative practice clock. */
export type HomePracticeInputNote = {
  start: number; end: number; midi: number; excluded?: boolean; track?: 1 | 2;
  /** Optional source positions use absolute frets measured from the nut. */
  string?: number; fret?: number;
};
export type HomePracticeScoreInput = {
  duration: number;
  notes: readonly HomePracticeInputNote[];
  steps: readonly { start: number; end: number; label: string }[];
  tuning?: "standard" | "drop-d";
  capo?: number;
};
export type HomePracticeScoreStep = { index: number; start: number; end: number; label: string };
export type HomePracticeScoreNote = {
  id: string; sourceIndex: number; start: number; end: number; midi: number;
  string: number; fret: number; track?: 1 | 2; stepIndex: number;
  positionSource: "source" | "suggested";
};
export type HomePracticeScore = {
  source: "performance-notes";
  tuning: "standard" | "drop-d";
  duration: number;
  steps: HomePracticeScoreStep[];
  notes: HomePracticeScoreNote[];
  /** Valid notes with no playable position or no free string on their track. */
  unplacedNoteCount: number;
};

const validDuration = (duration: number) => Number.isFinite(duration) && duration > 0 ? duration : 0;
const validSpan = (start: number, end: number, duration: number) =>
  Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && start < duration;

/**
 * Make a TAB view of real note events, never an accompaniment from chord names.
 * Pass practicePerformance(...) directly: its offset is already applied and is
 * not subtracted here. Suggested positions do not claim the player's fingering.
 * Absolute frets match notePositions/GuitarStage, including when a capo is used.
 */
export function buildPerformanceHomeScore(data: HomePracticeScoreInput, range: FretRange = { min: 0, max: 12 }): HomePracticeScore {
  const duration = validDuration(data.duration);
  const tuning = data.tuning === "drop-d" ? "drop-d" : "standard";
  const score: HomePracticeScore = {
    source: "performance-notes", tuning, duration, notes: [], unplacedNoteCount: 0,
    steps: data.steps.flatMap((step, index) => validSpan(step.start, step.end, duration)
      ? [{ index, start: step.start, end: Math.min(step.end, duration), label: step.label }] : [])
      .sort((a, b) => a.start - b.start || a.index - b.index),
  };
  if (!duration) return score;
  const capo = Number.isFinite(data.capo) ? Math.max(0, Math.min(21, Math.round(data.capo!))) : 0;
  const positionRange = [range.min, range.max].every(Number.isFinite) && range.min <= range.max
    ? { min: Math.max(0, Math.min(21, range.min)), max: Math.max(0, Math.min(21, range.max)) }
    : { min: 0, max: 12 };
  const open = [0, 64, 59, 55, 50, 45, tuning === "drop-d" ? 38 : 40];
  const sourcePosition = (note: HomePracticeInputNote) => {
    const string = note.string, fret = note.fret;
    return Number.isInteger(string) && string! >= 1 && string! <= 6 && Number.isInteger(fret) &&
      fret! >= capo && fret! <= 21 && open[string!] + fret! === note.midi
      ? { string: string!, fret: fret! } : null;
  };
  const notes = data.notes.flatMap((note, sourceIndex) => !note.excluded && validSpan(note.start, note.end, duration) &&
    Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127
    ? [{ ...note, sourceIndex, end: Math.min(note.end, duration) }] : [])
    .sort((a, b) => a.start - b.start || a.sourceIndex - b.sourceIndex);

  // Each guitar has its own six strings. Freeze positions within a track so a
  // later onset cannot move its sustaining notes or block the other guitar.
  // An unassigned note follows the existing default of guitar 1, while its
  // original track metadata remains unchanged in the result.
  for (const track of [1, 2] as const) {
    const trackNotes = notes.filter(note => (note.track ?? 1) === track);
    let sustained: HomePracticeScoreNote[] = [];
    for (let first = 0; first < trackNotes.length;) {
      let next = first + 1;
      while (next < trackNotes.length && Math.abs(trackNotes[next].start - trackNotes[first].start) < .0001) next++;
      const attack = trackNotes.slice(first, next);
      sustained = sustained.filter(note => note.end > attack[0].start);
      const suggestions = notePositions(attack.map(note => note.midi), tuning, positionRange, capo);
      const grouped = new Map<string, typeof attack>();
      for (const note of attack) {
        const written = sourcePosition(note);
        // Equal simultaneous pitches may share a visual position without losing
        // their separate source IDs, tracks or durations.
        const key = `${note.midi}:${written ? `${written.string}:${written.fret}` : "suggested"}`;
        const members = grouped.get(key) ?? [];
        members.push(note); grouped.set(key, members);
      }
      const units = [...grouped.values()];
      type Placement = { string: number; fret: number };
      type Assignment = { cost: number; placements: Map<number, Placement> };
      let states = new Map<number, Assignment>([[0, { cost: 0, placements: new Map() }]]);
      units.forEach((members, unitIndex) => {
        const note = members[0];
        const written = sourcePosition(note);
        const preferred = suggestions.find(p => p.midi === note.midi);
        const candidates = (written ? [written] : [1, 2, 3, 4, 5, 6].map(string => ({ string, fret: note.midi - open[string] }))
          .filter(p => p.fret >= capo && p.fret <= 21))
          .filter(p => sustained.every(previous => previous.string !== p.string || members.every(member => previous.end <= member.start)));
        const nextStates = new Map<number, Assignment>();
        function retain(mask: number, assignment: Assignment) {
          if (assignment.cost < (nextStates.get(mask)?.cost ?? Infinity)) nextStates.set(mask, assignment);
        }
        for (const [mask, state] of states) {
          // Prefer preserving an explicitly supplied source position when a
          // malformed simultaneous group cannot fit all its pitches.
          retain(mask, { cost: state.cost + (written ? 20000 : 10000), placements: state.placements });
          for (const p of candidates) {
            const bit = 1 << (p.string - 1);
            if (mask & bit) continue;
            const inRange = p.fret >= positionRange.min && p.fret <= positionRange.max;
            const cost = preferred?.string === p.string ? 0 : 1 + (inRange ? 0 : 100) + Math.abs(p.fret - (positionRange.min + positionRange.max) / 2);
            retain(mask | bit, { cost: state.cost + cost, placements: new Map([...state.placements, [unitIndex, p]]) });
          }
        }
        states = nextStates;
      });
      const assignment = [...states.values()].sort((a, b) => a.cost - b.cost)[0];
      units.forEach((members, unitIndex) => {
        const position = assignment.placements.get(unitIndex);
        if (!position) { score.unplacedNoteCount += members.length; return; }
        for (const note of members) {
          const placed: HomePracticeScoreNote = {
            id: `note:${note.sourceIndex}`, sourceIndex: note.sourceIndex,
            start: note.start, end: note.end, midi: note.midi,
            string: position.string, fret: position.fret, track: note.track,
            stepIndex: homeScoreStepAtTime(score, note.start), positionSource: sourcePosition(note) ? "source" : "suggested",
          };
          score.notes.push(placed);
          sustained.push(placed);
        }
      });
      first = next;
    }
  }
  score.notes.sort((a, b) => a.start - b.start || a.sourceIndex - b.sourceIndex);
  return score;
}

/** Clamp a seek to a playable instant; natural end-of-playback is still duration. */
export function homeScoreTime(score: Pick<HomePracticeScore, "duration">, time: number): number {
  const duration = validDuration(score.duration);
  if (!duration || Number.isNaN(time)) return 0;
  return Math.max(0, Math.min(time, duration - Math.min(.001, duration / 2)));
}

/** A rest, invalid time or the exact end has no active step; latest onset wins. */
export function homeScoreStepAtTime(score: Pick<HomePracticeScore, "duration" | "steps">, time: number): number {
  if (!Number.isFinite(time) || time < 0 || time >= score.duration) return -1;
  return score.steps.findLast(step => time >= step.start && time < step.end)?.index ?? -1;
}

/** Return every sounding event, preserving simultaneous notes and long sustains. */
export function homeScoreNotesAtTime(score: Pick<HomePracticeScore, "duration" | "notes">, time: number): HomePracticeScoreNote[] {
  if (!Number.isFinite(time) || time < 0 || time >= score.duration) return [];
  return score.notes.filter(note => time >= note.start && time < note.end);
}

/** Map the caller's original step index to its start, without manufacturing a rest step. */
export function homeScoreStepTime(score: Pick<HomePracticeScore, "duration" | "steps">, index: number): number {
  if (!score.steps.length || Number.isNaN(index)) return 0;
  const requested = Math.trunc(index);
  const exact = score.steps.find(step => step.index === requested);
  const ordered = score.steps.toSorted((a, b) => a.index - b.index);
  const fallback = ordered.find(step => step.index >= requested) ?? ordered.at(-1)!;
  return homeScoreTime(score, (exact ?? fallback).start);
}
