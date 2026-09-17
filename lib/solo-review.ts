import type { DetectedNote, Transcription } from "./transcription";

export const SOLO_PHRASE_GAP = .35;
export type SoloPhrase = { start: number; end: number; indices: number[] };

/** Silence groups are navigation aids, not inferred musical phrasing. Keep source indices for editing. */
export function analyzeSoloNotes(notes: DetectedNote[], duration: number) {
  const valid = notes.map((note, index) => ({ note, index })).filter(({ note }) =>
    !note.excluded && [note.start, note.end, note.midi].every(Number.isFinite) &&
    Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127 &&
    note.start >= 0 && note.end > note.start && note.start < duration
  ).sort((a, b) => a.note.start - b.note.start || a.index - b.index);
  const phrases: SoloPhrase[] = [];
  let low: number | null = null, high: number | null = null;
  for (const { note, index } of valid) {
    low = low === null ? note.midi : Math.min(low, note.midi);
    high = high === null ? note.midi : Math.max(high, note.midi);
    const previous = phrases.at(-1);
    if (!previous || note.start - previous.end >= SOLO_PHRASE_GAP - 1e-8) {
      phrases.push({ start: note.start, end: Math.min(duration, note.end), indices: [index] });
    } else {
      previous.indices.push(index);
      previous.end = Math.max(previous.end, Math.min(duration, note.end));
    }
  }
  return { count: valid.length, low, high, phrases };
}

export function soloLoop(start: number, end: number, duration: number) {
  return { start: Math.max(0, start - .12), end: Math.min(duration, end + .18) };
}

/** Match the part of the source that survives the score offset before offering practice. */
export function practiceEligibility(result: Transcription | null) {
  if (!result || !Number.isFinite(result.duration) || result.duration <= 0 || !Number.isFinite(result.score_settings.offset)) {
    return { notes: false, chords: false, allowed: false };
  }
  const offset = Math.max(0, Math.min(result.score_settings.offset, result.duration));
  const retained = (segment: { start: number; end: number }) =>
    [segment.start, segment.end].every(Number.isFinite) && segment.start >= 0 &&
    segment.start < result.duration && Math.min(segment.end, result.duration) > Math.max(segment.start, offset);
  const notes = result.notes.some(note => !note.excluded && retained(note) && Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127);
  const chords = result.chords.some(chord => chord.root !== null && Number.isInteger(chord.root) && chord.root >= 0 && chord.root < 12 && retained(chord));
  return { notes, chords, allowed: result.mode === "solo" ? notes : notes || chords };
}
