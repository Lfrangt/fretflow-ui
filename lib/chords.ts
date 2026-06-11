export type NoteMarker = {
  string: number; // 1 = high e (top), 6 = low E (bottom)
  fret: number;
  interval: string;
  finger: number;
};

export type ProgressionPreset = {
  id: string;
  name: string;
  style: string;
  chords: string[];
};

export type MarkerKind = "root" | "third" | "fifth" | "seventh" | "extension";

export const voicings: Record<string, NoteMarker[]> = {
  Am7: [
    { string: 6, fret: 5, interval: "R", finger: 1 },
    { string: 4, fret: 5, interval: "b7", finger: 1 },
    { string: 3, fret: 5, interval: "b3", finger: 1 },
    { string: 2, fret: 5, interval: "5", finger: 1 }
  ],
  D9: [
    { string: 5, fret: 5, interval: "R", finger: 2 },
    { string: 4, fret: 4, interval: "3", finger: 1 },
    { string: 3, fret: 5, interval: "b7", finger: 3 },
    { string: 2, fret: 5, interval: "9", finger: 4 }
  ],
  Gmaj7: [
    { string: 6, fret: 3, interval: "R", finger: 1 },
    { string: 4, fret: 4, interval: "7", finger: 3 },
    { string: 3, fret: 4, interval: "3", finger: 4 },
    { string: 2, fret: 3, interval: "5", finger: 2 }
  ],
  Cmaj7: [
    { string: 5, fret: 3, interval: "R", finger: 1 },
    { string: 4, fret: 5, interval: "5", finger: 3 },
    { string: 3, fret: 4, interval: "7", finger: 2 },
    { string: 2, fret: 5, interval: "3", finger: 4 }
  ],
  Dm9: [
    { string: 5, fret: 5, interval: "R", finger: 2 },
    { string: 4, fret: 3, interval: "b3", finger: 1 },
    { string: 3, fret: 5, interval: "b7", finger: 3 },
    { string: 2, fret: 5, interval: "9", finger: 4 }
  ],
  G13: [
    { string: 6, fret: 3, interval: "R", finger: 1 },
    { string: 4, fret: 3, interval: "b7", finger: 1 },
    { string: 3, fret: 4, interval: "3", finger: 2 },
    { string: 2, fret: 5, interval: "13", finger: 4 }
  ],
  Cmaj9: [
    { string: 5, fret: 3, interval: "R", finger: 2 },
    { string: 4, fret: 2, interval: "3", finger: 1 },
    { string: 3, fret: 4, interval: "7", finger: 4 },
    { string: 2, fret: 3, interval: "9", finger: 3 }
  ],
  A7b13: [
    { string: 6, fret: 5, interval: "R", finger: 1 },
    { string: 4, fret: 5, interval: "b7", finger: 1 },
    { string: 3, fret: 6, interval: "3", finger: 2 },
    { string: 2, fret: 6, interval: "b13", finger: 3 }
  ],
  Cm9: [
    { string: 6, fret: 8, interval: "R", finger: 1 },
    { string: 4, fret: 8, interval: "b7", finger: 1 },
    { string: 3, fret: 8, interval: "b3", finger: 1 },
    { string: 1, fret: 10, interval: "9", finger: 4 }
  ],
  F13: [
    { string: 5, fret: 8, interval: "R", finger: 2 },
    { string: 4, fret: 7, interval: "3", finger: 1 },
    { string: 3, fret: 8, interval: "b7", finger: 3 },
    { string: 1, fret: 10, interval: "13", finger: 4 }
  ],
  Bbmaj9: [
    { string: 6, fret: 6, interval: "R", finger: 1 },
    { string: 4, fret: 7, interval: "7", finger: 2 },
    { string: 3, fret: 7, interval: "3", finger: 3 },
    { string: 1, fret: 8, interval: "9", finger: 4 }
  ],
  G7alt: [
    { string: 6, fret: 3, interval: "R", finger: 1 },
    { string: 4, fret: 3, interval: "b7", finger: 1 },
    { string: 3, fret: 4, interval: "3", finger: 2 },
    { string: 2, fret: 4, interval: "b13", finger: 3 }
  ],
  Abmaj13: [
    { string: 6, fret: 4, interval: "R", finger: 1 },
    { string: 4, fret: 5, interval: "7", finger: 2 },
    { string: 3, fret: 5, interval: "3", finger: 3 },
    { string: 2, fret: 6, interval: "13", finger: 4 }
  ],
  Eb9: [
    { string: 5, fret: 6, interval: "R", finger: 2 },
    { string: 4, fret: 5, interval: "3", finger: 1 },
    { string: 3, fret: 6, interval: "b7", finger: 3 },
    { string: 2, fret: 6, interval: "9", finger: 4 }
  ],
  Db13: [
    { string: 5, fret: 4, interval: "R", finger: 2 },
    { string: 4, fret: 3, interval: "3", finger: 1 },
    { string: 3, fret: 4, interval: "b7", finger: 3 },
    { string: 1, fret: 6, interval: "13", finger: 4 }
  ],
  Bb13: [
    { string: 6, fret: 6, interval: "R", finger: 1 },
    { string: 4, fret: 6, interval: "b7", finger: 1 },
    { string: 3, fret: 7, interval: "3", finger: 2 },
    { string: 2, fret: 8, interval: "13", finger: 4 }
  ],
  C9: [
    { string: 5, fret: 3, interval: "R", finger: 2 },
    { string: 4, fret: 2, interval: "3", finger: 1 },
    { string: 3, fret: 3, interval: "b7", finger: 3 },
    { string: 2, fret: 3, interval: "9", finger: 4 }
  ],
  "F7#9": [
    { string: 5, fret: 8, interval: "R", finger: 2 },
    { string: 4, fret: 7, interval: "3", finger: 1 },
    { string: 3, fret: 8, interval: "b7", finger: 3 },
    { string: 2, fret: 9, interval: "#9", finger: 4 }
  ],
  "F#m11": [
    { string: 5, fret: 9, interval: "R", finger: 3 },
    { string: 4, fret: 7, interval: "b3", finger: 1 },
    { string: 3, fret: 9, interval: "b7", finger: 4 },
    { string: 1, fret: 7, interval: "11", finger: 1 }
  ],
  B13: [
    { string: 6, fret: 7, interval: "R", finger: 1 },
    { string: 4, fret: 7, interval: "b7", finger: 1 },
    { string: 3, fret: 8, interval: "3", finger: 2 },
    { string: 2, fret: 9, interval: "13", finger: 4 }
  ],
  Emaj9: [
    { string: 5, fret: 7, interval: "R", finger: 2 },
    { string: 4, fret: 6, interval: "3", finger: 1 },
    { string: 3, fret: 8, interval: "7", finger: 4 },
    { string: 2, fret: 7, interval: "9", finger: 3 }
  ],
  "C#7alt": [
    { string: 5, fret: 4, interval: "R", finger: 2 },
    { string: 4, fret: 3, interval: "3", finger: 1 },
    { string: 3, fret: 4, interval: "b7", finger: 3 },
    { string: 2, fret: 5, interval: "#9", finger: 4 }
  ],
  Am9: [
    { string: 6, fret: 5, interval: "R", finger: 1 },
    { string: 4, fret: 5, interval: "b7", finger: 1 },
    { string: 3, fret: 5, interval: "b3", finger: 1 },
    { string: 1, fret: 7, interval: "9", finger: 4 }
  ],
  Abdim7: [
    { string: 6, fret: 4, interval: "R", finger: 2 },
    { string: 4, fret: 3, interval: "bb7", finger: 1 },
    { string: 3, fret: 4, interval: "b3", finger: 3 },
    { string: 2, fret: 3, interval: "b5", finger: 1 }
  ],
  Gm9: [
    { string: 6, fret: 3, interval: "R", finger: 1 },
    { string: 4, fret: 3, interval: "b7", finger: 1 },
    { string: 3, fret: 3, interval: "b3", finger: 1 },
    { string: 1, fret: 5, interval: "9", finger: 4 }
  ],
  C13: [
    { string: 5, fret: 3, interval: "R", finger: 2 },
    { string: 4, fret: 2, interval: "3", finger: 1 },
    { string: 3, fret: 3, interval: "b7", finger: 3 },
    { string: 1, fret: 5, interval: "13", finger: 4 }
  ]
};

export const progressionPresets: ProgressionPreset[] = [
  { id: "jazz-turnaround", name: "Jazz Turnaround", style: "ii–V–I–VI", chords: ["Dm9", "G13", "Cmaj9", "A7b13"] },
  { id: "neo-soul", name: "Neo-Soul Glide", style: "ii–V–I in B♭", chords: ["Cm9", "F13", "Bbmaj9", "G7alt"] },
  { id: "backdoor", name: "Backdoor Color", style: "Borrowed motion", chords: ["Cmaj9", "Eb9", "Abmaj13", "Db13"] },
  { id: "dominant-blues", name: "Dominant Blues", style: "Cycle in F", chords: ["F13", "Bb13", "F13", "C9", "Bb13", "F7#9"] },
  { id: "minor-soul", name: "Minor Release", style: "R&B in E", chords: ["F#m11", "B13", "Emaj9", "C#7alt"] },
  { id: "dim-passing", name: "Diminished Pass", style: "Chromatic descent", chords: ["Am9", "Abdim7", "Gm9", "C13"] }
];

export const defaultProgression = progressionPresets[0];

const openStringMidi: Record<number, number> = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };

export function markerKind(interval: string): MarkerKind {
  if (interval === "R") return "root";
  if (interval === "3" || interval === "b3") return "third";
  if (interval === "5" || interval === "b5" || interval === "#5") return "fifth";
  if (interval.includes("7")) return "seventh";
  return "extension";
}

function canonicalChordLabel(chord: string) {
  return chord.trim().replaceAll("♭", "b").replaceAll("♯", "#").replace(/[()]/g, "");
}

export function chordMarkers(chord: string): NoteMarker[] {
  return voicings[chord] ?? voicings[canonicalChordLabel(chord)] ?? voicings.Am7;
}

export function parseProgression(value: string): string[] {
  const chords = value
    .split(/[\s,|>-]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return chords.length ? chords : defaultProgression.chords;
}

export function markerMidi(marker: NoteMarker) {
  return openStringMidi[marker.string] + marker.fret;
}

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}
