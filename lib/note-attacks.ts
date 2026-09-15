import type { DetectedNote } from "./transcription";

export type EstimatedAttack = {
  start: number;
  indices: number[];
  ringing: number[];
  kind: "single" | "double" | "multiple" | "unison";
  harmonicPairs: [number, number][];
};

/** Groups estimated attacks, never simultaneous ringing or score-grid beats.
 * Labels describe model candidates, not verified playing technique.
 */
export function groupEstimatedAttacks(notes: readonly DetectedNote[]): EstimatedAttack[] {
  const active = notes.map((note, index) => ({ note, index })).filter(({ note }) =>
    !note.excluded && [note.start, note.end, note.midi].every(Number.isFinite) &&
    note.start >= 0 && note.end > note.start);
  active.sort((a, b) => a.note.start - b.note.start || a.note.midi - b.note.midi);
  const groups: EstimatedAttack[] = [];
  for (const { note, index } of active) {
    let group = groups.at(-1);
    // Anchor to the first onset; do not chain an arpeggio into one chord.
    if (!group || note.start - group.start > .04) {
      group = { start: note.start, indices: [], ringing: [], kind: "single", harmonicPairs: [] };
      groups.push(group);
    }
    group.indices.push(index);
  }
  for (const group of groups) {
    const pitches = new Set(group.indices.map(i => notes[i].midi));
    group.kind = group.indices.length === 1 ? "single" : pitches.size === 1 ? "unison" : pitches.size === 2 ? "double" : "multiple";
    group.ringing = active.filter(({ note, index }) => !group.indices.includes(index) &&
      note.start < group.start && note.end > group.start).map(({ index }) => index);
    const sounding = [...group.indices, ...group.ringing];
    for (let a = 0; a < sounding.length; a++) for (let b = a + 1; b < sounding.length; b++) {
      const i = sounding[a], j = sounding[b];
      if (![i, j].some(index => group.indices.includes(index))) continue;
      if ([12, 19, 24].includes(Math.abs(notes[i].midi - notes[j].midi))) {
        group.harmonicPairs.push(notes[i].midi < notes[j].midi ? [i, j] : [j, i]);
      }
    }
  }
  return groups;
}
