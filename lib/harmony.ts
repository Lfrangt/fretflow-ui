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
