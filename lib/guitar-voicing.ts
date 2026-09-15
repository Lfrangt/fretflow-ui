export type GuitarMarker = { string: number; fret: number; interval: string; finger: number };
export type FretRange = { min: number; max: number };
export const PRACTICE_RANGE: FretRange = { min: 5, max: 12 };
const roots: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const open = [0, 64, 59, 55, 50, 45, 40];
// Compact comping shapes keep the third, seventh and named extension. A fifth
// may be omitted in extended chords; these are arrangements, not transcriptions.
const tones: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  m6: [0, 3, 7, 9], "6": [0, 4, 7, 9], m7: [0, 3, 7, 10], mmaj7: [0, 3, 7, 11],
  maj7: [0, 4, 7, 11], "7": [0, 4, 7, 10], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], sus2: [0, 2, 7], sus4: [0, 5, 7],
  add9: [0, 4, 7, 2], madd9: [0, 3, 7, 2], "9": [0, 4, 10, 2], m9: [0, 3, 10, 2], maj9: [0, 4, 11, 2],
  m11: [0, 3, 10, 5], "13": [0, 4, 10, 9], maj13: [0, 4, 11, 9], "7b13": [0, 4, 10, 8], "7alt": [0, 4, 10, 8], "7#9": [0, 4, 10, 3], "7b9": [0, 4, 10, 1],
  "7sus4": [0, 5, 7, 10], "5": [0, 7] };
const labels = ["R", "b2", "2", "b3", "3", "4", "b5", "5", "#5", "6", "b7", "7"];
const pitchClass = (name: string, accidental = "") => (roots[name] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) + 12) % 12;
export const shapeId = (markers: GuitarMarker[]) => [...markers].sort((a, b) => a.string - b.string).map(m => `${m.string}:${m.fret}`).join(";");
export function inFretRange(markers: GuitarMarker[], range: FretRange) {
  return markers.length > 0 && markers.every(m => m.fret >= range.min && m.fret <= range.max);
}
const center = (markers: GuitarMarker[]) => markers.length ? markers.reduce((sum, m) => sum + m.fret, 0) / markers.length : 0;
export function movementCost(a: GuitarMarker[], b: GuitarMarker[]) {
  if (!a.length || !b.length) return 0;
  return Math.abs(center(a) - center(b)) * 2 + b.reduce((sum, m) => {
    const same = a.find(n => n.string === m.string);
    return sum + (same ? Math.abs(m.fret - same.fret) : 2);
  }, 0) / b.length;
}

export function voicingCandidates(label: string, range: FretRange = PRACTICE_RANGE, seeds: GuitarMarker[] = []): GuitarMarker[][] {
  if (!Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min < 0 || range.max > 21 || range.min > range.max) return [];
  const match = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(label.replaceAll("♭", "b").replaceAll("♯", "#").replace(/[()]/g, ""));
  if (!match) return [];
  const root = pitchClass(match[1], match[2]);
  const intervals = tones[match[3]];
  const requiredBass = match[4] ? pitchClass(match[4], match[5]) : null;
  const choices = new Map<string, GuitarMarker[]>();
  for (const octave of [-12, 0, 12]) {
    const moved = seeds.map(m => ({ ...m, fret: m.fret + octave }));
    if (inFretRange(moved, range)) choices.set(shapeId(moved), moved);
  }
  if (intervals && (requiredBass === null || intervals.some(interval => (root + interval) % 12 === requiredBass))) {
    for (let base = Math.max(1, range.min); base <= range.max; base++) {
      function place(index: number, markers: GuitarMarker[]) {
        if (index === intervals.length) {
          const bass = Math.min(...markers.map(m => open[m.string] + m.fret));
          if (requiredBass !== null && bass % 12 !== requiredBass) return;
          const fretted = [...markers].filter(m => m.fret > 0).sort((a, b) => a.fret - b.fret || b.string - a.string);
          const shape = markers.map(m => ({ ...m, finger: m.fret ? fretted.indexOf(m) + 1 : 0 }));
          choices.set(shapeId(shape), shape);
          return;
        }
        const interval = intervals[index];
        let name = labels[interval];
        if (match![3] === "dim7" && interval === 9) name = "bb7";
        else if (interval === 2 && match![3].includes("9")) name = "9";
        else if (interval === 5 && match![3].includes("11")) name = "11";
        else if (interval === 9 && match![3].includes("13")) name = "13";
        else if (interval === 8 && (match![3].includes("b13") || match![3] === "7alt")) name = "b13";
        else if (interval === 3 && match![3].includes("#9")) name = "#9";
        else if (interval === 1 && match![3].includes("b9")) name = "b9";
        for (let string = 6; string >= 1; string--) {
          if (markers.some(m => m.string === string)) continue;
          const frets = Array.from({ length: Math.min(4, range.max - base + 1) }, (_, i) => base + i);
          if (range.min === 0) frets.unshift(0);
          for (const fret of frets) if ((open[string] + fret) % 12 === (root + interval) % 12) place(index + 1, [...markers, { string, fret, interval: name, finger: 0 }]);
        }
      }
      place(0, []);
    }
  }
  function cost(shape: GuitarMarker[]) {
    const frets = shape.filter(m => m.fret > 0).map(m => m.fret);
    const bass = Math.min(...shape.map(m => open[m.string] + m.fret));
    const gaps = Math.max(...shape.map(m => m.string)) - Math.min(...shape.map(m => m.string)) + 1 - shape.length;
    return gaps * 1.3 + (Math.max(0, ...frets) - (frets.length ? Math.min(...frets) : 0)) * .5 + Math.abs(center(shape) - (range.min + range.max) / 2) * .3 + (bass % 12 === root ? 0 : 1.5);
  }
  return [...choices.values()].sort((a, b) => cost(a) - cost(b) || shapeId(a).localeCompare(shapeId(b))).slice(0, 32);
}

export function suggestedVoicing(label: string, range: FretRange = PRACTICE_RANGE): GuitarMarker[] {
  return voicingCandidates(label, range)[0] ?? [];
}

/** Dynamic programming across the sequence, including pinned source/visual choices. */
export function connectVoicings(choices: GuitarMarker[][][]): GuitarMarker[][] {
  if (!choices.length) return [];
  const rows = choices.map(row => row.length ? row : [[]]);
  let costs = rows[0].map((_, i) => i * .03);
  const paths: number[][] = [rows[0].map(() => -1)];
  for (let index = 1; index < rows.length; index++) {
    const parents: number[] = [];
    costs = rows[index].map((shape, j) => {
      let cost = Infinity, parent = 0;
      rows[index - 1].forEach((previous, k) => {
        const candidate = costs[k] + movementCost(previous, shape) + j * .03;
        if (candidate < cost) { cost = candidate; parent = k; }
      });
      parents.push(parent); return cost;
    });
    paths.push(parents);
  }
  let choice = costs.indexOf(Math.min(...costs));
  const result: GuitarMarker[][] = Array(rows.length);
  for (let i = rows.length - 1; i >= 0; i--) { result[i] = rows[i][choice]; choice = paths[i][choice]; }
  return result;
}
