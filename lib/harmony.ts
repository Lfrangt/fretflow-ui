export type KeyName = "C" | "Db" | "D" | "Eb" | "E" | "F" | "Gb" | "G" | "Ab" | "A" | "Bb" | "B";

export const KEYS: KeyName[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const letterSemitones: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

const degreeNames = ["I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII"];

// Root = leading letter plus an accidental only if it immediately follows,
// so the "b13" in "A7b13" never reads as a flat root.
function parseRoot(chord: string): { semitone: number; suffix: string } | null {
  const match = /^([A-G])([#b]?)/.exec(chord);
  if (!match) return null;
  let semitone = letterSemitones[match[1]];
  if (match[2] === "#") semitone += 1;
  if (match[2] === "b") semitone -= 1;
  return { semitone: (semitone + 12) % 12, suffix: chord.slice(match[0].length) };
}

export function chordRoot(chord: string): KeyName | null {
  const parsed = parseRoot(chord);
  return parsed ? KEYS[parsed.semitone] : null;
}

type ChordQuality = "major" | "dominant" | "minor" | "diminished" | "halfDiminished";

function chordQuality(suffix: string): ChordQuality {
  if (suffix.includes("dim")) return "diminished";
  if (suffix.includes("m7b5") || suffix.includes("ø")) return "halfDiminished";
  // The minor "m" must not be the one inside "maj" (dim is already handled).
  if (suffix.replace(/maj/g, "").includes("m")) return "minor";
  if (suffix.includes("maj")) return "major";
  // sus/add/6 color a major-family chord; they are not dominant sevenths.
  if (/sus|add|^6/.test(suffix)) return "major";
  if (/[0-9]|alt/.test(suffix)) return "dominant";
  return "major";
}

export function chordDegree(chord: string, key: KeyName): string {
  const parsed = parseRoot(chord);
  if (!parsed) return "?";
  const distance = (parsed.semitone - KEYS.indexOf(key) + 12) % 12;
  const base = degreeNames[distance];
  switch (chordQuality(parsed.suffix)) {
    case "diminished":
      return base.toLowerCase() + "°";
    case "halfDiminished":
      return base.toLowerCase() + "ø";
    case "minor":
      return base.toLowerCase();
    default:
      return base;
  }
}

export function detectKey(chords: string[]): KeyName {
  let bestKey: KeyName = "C";
  let bestScore = -1;
  let bestHasTonic = false;

  for (const key of KEYS) {
    const keySemitone = KEYS.indexOf(key);
    let score = 0;
    let hasTonic = false;

    chords.forEach((chord, index) => {
      const parsed = parseRoot(chord);
      if (!parsed) return;
      const distance = (parsed.semitone - keySemitone + 12) % 12;
      const quality = chordQuality(parsed.suffix);
      const majorish = quality === "major" || quality === "dominant";

      if (distance === 0) hasTonic = true;

      if (distance === 0 && majorish) {
        score += 3;
        if (index === 0 || index === chords.length - 1) score += 2;
      } else if (distance === 7 && majorish) {
        score += 2.5;
      } else if (distance === 2 && quality === "minor") {
        score += 2;
      } else if (distance === 5 && majorish) {
        score += 1.5;
      } else if (distance === 9 && quality === "minor") {
        score += 1;
      } else if (distance === 4 && quality === "minor") {
        score += 1;
      } else if (distance === 10 && quality === "dominant") {
        score += 0.5;
      }
    });

    if (score > bestScore || (score === bestScore && hasTonic && !bestHasTonic)) {
      bestKey = key;
      bestScore = score;
      bestHasTonic = hasTonic;
    }
  }

  return bestKey;
}

export const presetKeys: Record<string, KeyName> = {
  "neo-soul": "Bb",
  "jazz-turnaround": "C",
  backdoor: "C",
  "dominant-blues": "F",
  "minor-soul": "E",
  "dim-passing": "F"
};

export type ChordScaleCandidate = {
  id: string;
  nameKey: string;
  root: string;
  intervals: number[];
  notes: string[];
  degrees: string[];
  chordToneFlags: boolean[];
  reasonKey: string;
  keyMatch?: boolean;
};

type ScaleFamily = "major" | "minor" | "dominant" | "diminished" | "halfDiminished" | "augmented" | "suspended" | "power" | "altered";
type ScalePattern = { id: string; nameKey: string; degrees: string[]; intervals: number[] };

const scalePatterns: ScalePattern[] = [
  ["ionian", "Ionian (major)", "1 2 3 4 5 6 7"],
  ["dorian", "Dorian", "1 2 b3 4 5 6 b7"],
  ["phrygian", "Phrygian", "1 b2 b3 4 5 b6 b7"],
  ["lydian", "Lydian", "1 2 3 #4 5 6 7"],
  ["mixolydian", "Mixolydian", "1 2 3 4 5 6 b7"],
  ["aeolian", "Aeolian (natural minor)", "1 2 b3 4 5 b6 b7"],
  ["locrian", "Locrian", "1 b2 b3 4 b5 b6 b7"],
  ["melodic-minor", "Melodic minor (ascending)", "1 2 b3 4 5 6 7"],
  ["dorian-b2", "Dorian b2", "1 b2 b3 4 5 6 b7"],
  ["lydian-augmented", "Lydian augmented", "1 2 3 #4 #5 6 7"],
  ["lydian-dominant", "Lydian dominant", "1 2 3 #4 5 6 b7"],
  ["mixolydian-b6", "Mixolydian b6", "1 2 3 4 5 b6 b7"],
  ["locrian-natural-2", "Locrian natural 2", "1 2 b3 4 b5 b6 b7"],
  ["altered", "Altered", "1 b2 #2 3 b5 #5 b7"],
  ["harmonic-minor", "Harmonic minor", "1 2 b3 4 5 b6 7"],
  ["phrygian-dominant", "Phrygian dominant", "1 b2 3 4 5 b6 b7"],
  ["whole-half-diminished", "Whole-half diminished", "1 2 b3 4 b5 b6 6 7"],
  ["half-whole-diminished", "Half-whole diminished", "1 b2 #2 3 #4 5 6 b7"],
  ["whole-tone", "Whole tone", "1 2 3 #4 #5 b7"]
].map(([id, nameKey, formula]) => {
  const degrees = formula.split(" ");
  return { id, nameKey, degrees, intervals: degrees.map(scaleDegreeSemitone) };
});

// These are priorities, never sufficient matches: every required pitch is checked
// below. Families keep e.g. a dominant altered scale off a half-diminished chord.
const scalePriorities: Record<ScaleFamily, string[]> = {
  major: ["ionian", "lydian", "lydian-augmented"],
  minor: ["dorian", "aeolian", "phrygian", "melodic-minor", "harmonic-minor", "dorian-b2"],
  dominant: ["mixolydian", "lydian-dominant", "mixolydian-b6", "phrygian-dominant", "half-whole-diminished", "altered", "whole-tone"],
  diminished: ["locrian", "locrian-natural-2", "whole-half-diminished"],
  halfDiminished: ["locrian", "locrian-natural-2"],
  augmented: ["lydian-augmented", "whole-tone", "mixolydian-b6", "phrygian-dominant", "altered"],
  suspended: ["mixolydian", "dorian", "aeolian", "ionian", "phrygian", "lydian", "dorian-b2"],
  power: ["ionian", "mixolydian", "aeolian"],
  altered: ["altered"]
};

// Compact extension formulas follow guitar-voicing.ts: a missing fifth in a
// 9/11/13 or altered-dominant voicing is not evidence of a perfect fifth.
const scaleChordFormulas: Record<string, [ScaleFamily, string]> = {
  "": ["major", "1 3 5"], m: ["minor", "1 b3 5"], dim: ["diminished", "1 b3 b5"], aug: ["augmented", "1 3 #5"],
  "6": ["major", "1 3 5 6"], m6: ["minor", "1 b3 5 6"],
  "7": ["dominant", "1 3 5 b7"], maj7: ["major", "1 3 5 7"], m7: ["minor", "1 b3 5 b7"], mmaj7: ["minor", "1 b3 5 7"],
  dim7: ["diminished", "1 b3 b5 bb7"], m7b5: ["halfDiminished", "1 b3 b5 b7"],
  sus2: ["suspended", "1 2 5"], sus4: ["suspended", "1 4 5"], "7sus4": ["suspended", "1 4 5 b7"],
  add9: ["major", "1 3 5 9"], madd9: ["minor", "1 b3 5 9"],
  "9": ["dominant", "1 3 b7 9"], maj9: ["major", "1 3 7 9"], m9: ["minor", "1 b3 b7 9"],
  "11": ["dominant", "1 3 b7 9 11"], maj11: ["major", "1 3 7 9 11"], m11: ["minor", "1 b3 b7 11"],
  "13": ["dominant", "1 3 b7 13"], maj13: ["major", "1 3 7 13"], m13: ["minor", "1 b3 b7 13"],
  "7b9": ["dominant", "1 3 b7 b9"], "7#9": ["dominant", "1 3 b7 #9"], "7b13": ["dominant", "1 3 b7 b13"],
  "7alt": ["altered", "1 3 b7 b13"], "5": ["power", "1 5"]
};
const scaleChordSuffixes = Object.keys(scaleChordFormulas).sort((a, b) => b.length - a.length);

function scaleDegreeSemitone(degree: string): number {
  const match = /^([b#]*)(\d+)$/.exec(degree)!;
  const natural = [0, 2, 4, 5, 7, 9, 11][(Number(match[2]) - 1) % 7];
  const accidental = [...match[1]].reduce((value, sign) => value + (sign === "#" ? 1 : -1), 0);
  return (natural + accidental + 12) % 12;
}

function scaleNoteName(root: string, interval: number, degree: string): string {
  const letters = "CDEFGAB";
  const degreeNumber = Number(degree.replace(/[b#]/g, ""));
  const letter = letters[(letters.indexOf(root[0]) + degreeNumber - 1) % 7];
  const rootPitch = (letterSemitones[root[0]] + (root[1] === "#" ? 1 : root[1] === "b" ? -1 : 0) + 12) % 12;
  let accidental = (rootPitch + interval - letterSemitones[letter] + 12) % 12;
  if (accidental > 6) accidental -= 12;
  return letter + (accidental < 0 ? "b".repeat(-accidental) : "#".repeat(accidental));
}

function parseScaleChord(chord: string) {
  const normalized = chord.trim().replaceAll("♭", "b").replaceAll("♯", "#");
  // Permit conventional parenthesized extensions; do not silently repair syntax.
  if (!/^[A-G][#b]?[^()\s]*(?:\([^()\s]+\))?(?:\/[A-G][#b]?)?$/.test(normalized)) return null;
  const extensions = normalized.replace(/\(([^()]*)\)/g, (_match, extension: string) => extension.replaceAll(",", ""));
  const match = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(extensions);
  if (!match) return null;
  let suffix = match[2]
    .replace(/^m(?:Maj|M)/, "mmaj").replace(/^M/, "maj").replace(/^min/, "m")
    .replace(/^Δ/, "maj").replace(/^ø7?/, "m7b5").replace(/^[°º]/, "dim").replace(/^\+/, "aug");
  const base = scaleChordSuffixes.find(candidate => suffix.startsWith(candidate)
    && /^(?:(?:b|#)(?:5|9|11|13)|add(?:9|11|13)|sus[24])*$/.test(suffix.slice(candidate.length)));
  if (base === undefined) return null;
  const [initialFamily, formula] = scaleChordFormulas[base];
  let family = initialFamily;
  const degrees = new Set(formula.split(" "));
  const addedDegrees = new Set<string>();
  suffix = suffix.slice(base.length);
  for (const token of suffix.match(/(?:b|#)(?:5|9|11|13)|add(?:9|11|13)|sus[24]/g) ?? []) {
    if (token.startsWith("sus")) {
      degrees.delete("3"); degrees.delete("b3");
      addedDegrees.add(token.slice(3));
      family = "suspended";
    } else if (token.startsWith("add")) addedDegrees.add(token.slice(3));
    else {
      degrees.delete(token.slice(1));
      addedDegrees.add(token);
    }
  }
  const root = match[1];
  const rootPitch = parseRoot(root)!.semitone;
  const required = new Set([...degrees, ...addedDegrees].map(scaleDegreeSemitone));
  if (match[3]) required.add((parseRoot(match[3])!.semitone - rootPitch + 12) % 12);
  return { root, rootPitch, required, family };
}

/** Practice suggestions from a finite local vocabulary, not detected song scales.
 * Pass key only for an explicit user-selected major key, never an auto estimate.
 * Extra pitch classes are absolute sounding pitches (including capo/tuning once).
 */
export function chordScaleCandidates(
  chord: string,
  options: { key?: KeyName; chordPitchClasses?: readonly number[] } = {}
): ChordScaleCandidate[] {
  if (typeof chord !== "string") return [];
  const parsed = parseScaleChord(chord);
  if (!parsed) return [];
  if (options.chordPitchClasses?.some(pitch => !Number.isInteger(pitch) || pitch < 0 || pitch > 11)) return [];
  for (const pitch of options.chordPitchClasses ?? []) parsed.required.add((pitch - parsed.rootPitch + 12) % 12);
  const keyRoot = options.key === undefined ? -1 : KEYS.indexOf(options.key);
  const keyPitches = new Set([0, 2, 4, 5, 7, 9, 11].map(interval => (keyRoot + interval) % 12));
  return scalePriorities[parsed.family]
    .map(id => scalePatterns.find(pattern => pattern.id === id)!)
    .filter(pattern => [...parsed.required].every(pitch => pattern.intervals.includes(pitch)))
    .slice(0, 3)
    .map(pattern => ({
      id: pattern.id,
      nameKey: pattern.nameKey,
      root: parsed.root,
      intervals: [...pattern.intervals],
      notes: pattern.intervals.map((interval, index) => scaleNoteName(parsed.root, interval, pattern.degrees[index])),
      degrees: [...pattern.degrees],
      chordToneFlags: pattern.intervals.map(interval => parsed.required.has(interval)),
      reasonKey: parsed.family === "altered" ? "Matches the altered dominant tones" : "Contains the chord tones and extensions",
      ...(keyRoot >= 0 ? { keyMatch: pattern.intervals.length === 7 && pattern.intervals.every(interval => keyPitches.has((parsed.rootPitch + interval) % 12)) } : {})
    }));
}
