import type { GuitarMarker } from "./guitar-voicing";

export const STANDARD_OPEN = [0, 64, 59, 55, 50, 45, 40];
export const PITCH_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export type ChordMatch = { name: string; root: number; omittedFifth: boolean };
const intervals = ["R", "b2", "2", "b3", "3", "4", "b5", "5", "#5", "6", "b7", "7"];
// Exact pitch-class matches only. Optional fifths are explicitly disclosed;
// no guessed roots, missing thirds or extra pitches are silently accepted.
const qualities: [string, number[], boolean?][] = [
  ["", [0,4,7]], ["m", [0,3,7]], ["dim", [0,3,6]], ["aug", [0,4,8]],
  ["sus2", [0,2,7]], ["sus4", [0,5,7]], ["5", [0,7]],
  ["7", [0,4,7,10]], ["maj7", [0,4,7,11]], ["m7", [0,3,7,10]], ["mmaj7", [0,3,7,11]],
  ["6", [0,4,7,9]], ["m6", [0,3,7,9]], ["dim7", [0,3,6,9]], ["m7b5", [0,3,6,10]],
  ["add9", [0,2,4,7]], ["madd9", [0,2,3,7]], ["7sus4", [0,5,7,10]],
  ["9", [0,2,4,7,10], true], ["maj9", [0,2,4,7,11], true], ["m9", [0,2,3,7,10], true],
  ["m11", [0,3,5,10], true], ["13", [0,4,9,10], true], ["maj13", [0,4,9,11], true],
  ["7b9", [0,1,4,7,10], true], ["7#9", [0,3,4,7,10], true], ["7b13", [0,4,8,10], true],
];

export function validShape(shape: GuitarMarker[]) {
  return shape.length <= 6 && new Set(shape.map(m => m.string)).size === shape.length && shape.every(m =>
    Number.isInteger(m.string) && m.string >= 1 && m.string <= 6 && Number.isInteger(m.fret) && m.fret >= 0 && m.fret <= 21);
}

export function identifyChord(shape: GuitarMarker[]): ChordMatch[] {
  if (!shape.length || !validShape(shape)) return [];
  const pitches = shape.map(m => STANDARD_OPEN[m.string] + m.fret);
  const pcs = new Set(pitches.map(midi => midi % 12));
  if (pcs.size < 2) return [];
  const bass = Math.min(...pitches) % 12;
  const matches: ChordMatch[] = [];
  for (let root = 0; root < 12; root++) for (const [quality, required, optionalFifth] of qualities) {
    const full = optionalFifth ? [...new Set([...required, 7])] : required;
    for (const candidate of optionalFifth ? [full, full.filter(n => n !== 7)] : [full]) {
      if (candidate.length !== pcs.size || !candidate.every(n => pcs.has((root + n) % 12))) continue;
      matches.push({ name: PITCH_NAMES[root] + quality + (bass === root ? "" : `/${PITCH_NAMES[bass]}`), root,
        omittedFifth: Boolean(optionalFifth && !candidate.includes(7)) });
    }
  }
  return matches.sort((a,b) => Number(a.omittedFifth) - Number(b.omittedFifth) || Number(a.root !== bass) - Number(b.root !== bass));
}

export function nameShape(shape: GuitarMarker[], root?: number): GuitarMarker[] {
  return shape.map(m => ({ ...m, finger: 0, interval: root === undefined ? PITCH_NAMES[(STANDARD_OPEN[m.string] + m.fret) % 12]
    : intervals[(STANDARD_OPEN[m.string] + m.fret - root + 12) % 12] }));
}
