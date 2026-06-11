"use client";

import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiquidChrome } from "@/components/liquid-chrome";
import type { KeyName } from "@/lib/harmony";
import { KEYS, chordDegree, detectKey, presetKeys } from "@/lib/harmony";

type NoteMarker = {
  string: number;
  fret: number;
  interval: string;
  finger: number;
};

type LoopMode = "full" | "pair" | "hold";
type InputMode = "text" | "chart" | "audio";
type AnalysisState = "idle" | "analyzing" | "ready" | "error";

type Skin = {
  id: string;
  name: string;
  src: string;
  alt: string;
  aspectRatio: string;
  fretboard: {
    left: string;
    top: string;
    width: string;
    height: string;
  };
};

type TonePreset = {
  id: string;
  name: string;
  oscillator: OscillatorType;
  filter: number;
  gain: number;
  decay: number;
  detune: number;
};

type MarkerPalette = {
  id: string;
  name: string;
  root: string;
  third: string;
  fifth: string;
  seventh: string;
  extension: string;
};

type ProgressionPreset = {
  id: string;
  name: string;
  style: string;
  value: string;
};

type SongSection = {
  name: string;
  bars: string[][];
};

type AnalysisResult = {
  source: "MP3 analysis" | "Chart OCR";
  title: string;
  key: string;
  bpm: number;
  confidence: number;
  progression: string;
  sections: SongSection[];
};

type WebAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const voicings: Record<string, NoteMarker[]> = {
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

const defaultProgression = "Am7  D9  Gmaj7  Cmaj7";

const progressionPresets: ProgressionPreset[] = [
  { id: "neo-soul", name: "Neo-Soul ii V I VI", style: "R&B", value: "Cm9  F13  Bbmaj9  G7alt" },
  { id: "jazz-turnaround", name: "Jazz ii V I Turnaround", style: "Jazz", value: "Dm9  G13  Cmaj9  A7b13" },
  { id: "backdoor", name: "Backdoor Color Move", style: "Neo-Soul", value: "Cmaj9  Eb9  Abmaj13  Db13" },
  { id: "dominant-blues", name: "Dominant Blues Cycle", style: "Blues", value: "F13  Bb13  F13  C9  Bb13  F7#9" },
  { id: "minor-soul", name: "Minor Soul Release", style: "R&B", value: "F#m11  B13  Emaj9  C#7alt" },
  { id: "dim-passing", name: "Diminished Passing", style: "Jazz", value: "Am9  Abdim7  Gm9  C13" }
];

const chartRecognitionDraft: AnalysisResult = {
  source: "Chart OCR",
  title: "Imported chord chart",
  key: "C minor",
  bpm: 78,
  confidence: 0.88,
  progression: "Cm9  F13  Bbmaj9  G7alt  Cmaj9  Eb9  Abmaj13  Db13",
  sections: [
    { name: "Intro", bars: [["Cm9", "F13"], ["Bbmaj9", "G7alt"]] },
    { name: "Verse", bars: [["Cm9", "F13"], ["Bbmaj9", "G7alt"], ["Cmaj9", "Eb9"], ["Abmaj13", "Db13"]] },
    { name: "Tag", bars: [["Am9", "Abdim7"], ["Gm9", "C13"]] }
  ]
};

const skins: Skin[] = [
  {
    id: "relic",
    name: "Relic Sunburst",
    src: "/assets/fender-guitar-clean.png",
    alt: "Relic sunburst electric guitar",
    aspectRatio: "2700 / 1040",
    fretboard: { left: "19.2%", top: "43.1%", width: "46.6%", height: "18.2%" }
  },
  {
    id: "olive",
    name: "Olive Pearl",
    src: "/assets/guitar-olive-pearl.svg",
    alt: "Olive electric guitar",
    aspectRatio: "1800 / 620",
    fretboard: { left: "28.6%", top: "35.5%", width: "48.4%", height: "22.8%" }
  },
  {
    id: "cream",
    name: "Cream Strat",
    src: "/assets/guitar-cream.svg",
    alt: "Cream electric guitar",
    aspectRatio: "1800 / 620",
    fretboard: { left: "28.6%", top: "35.5%", width: "48.4%", height: "22.8%" }
  }
];

const openStringMidi: Record<number, number> = {
  6: 40,
  5: 45,
  4: 50,
  3: 55,
  2: 59,
  1: 64
};

const tonePresets: TonePreset[] = [
  { id: "round", name: "Round Clean", oscillator: "triangle", filter: 1500, gain: 0.07, decay: 1.45, detune: 0 },
  { id: "bright", name: "Bright Bridge", oscillator: "sawtooth", filter: 2800, gain: 0.055, decay: 1.15, detune: 3 },
  { id: "jazz", name: "Warm Jazz", oscillator: "sine", filter: 980, gain: 0.085, decay: 1.75, detune: -4 },
  { id: "muted", name: "Muted Practice", oscillator: "triangle", filter: 720, gain: 0.06, decay: 0.62, detune: 0 },
  { id: "chorus", name: "Soft Chorus", oscillator: "triangle", filter: 1800, gain: 0.055, decay: 1.7, detune: 7 }
];

const markerPalettes: MarkerPalette[] = [
  { id: "classic", name: "Classic", root: "#c59b50", third: "#6f9467", fifth: "#5d82a7", seventh: "#b66b5f", extension: "#8f7aa8" },
  { id: "mono", name: "Mono", root: "#1f1f1d", third: "#68635b", fifth: "#a9a39a", seventh: "#d8d0c3", extension: "#8a8378" },
  { id: "stage", name: "Stage", root: "#e0b44f", third: "#65a36f", fifth: "#4f89c7", seventh: "#d06b5f", extension: "#9b77d8" }
];

function parseProgression(value: string) {
  const chords = value
    .split(/[\s,|>-]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return chords.length ? chords : ["Am7", "D9", "Gmaj7", "Cmaj7"];
}

function canonicalChordLabel(chord: string) {
  return chord
    .trim()
    .replaceAll("♭", "b")
    .replaceAll("♯", "#")
    .replace(/[()]/g, "");
}

function markerClass(interval: string) {
  if (interval === "R") return "root";
  if (interval === "3" || interval === "b3") return "third";
  if (interval === "5" || interval === "b5" || interval === "#5") return "fifth";
  if (interval.includes("7")) return "seventh";
  return "extension";
}

function normalizeMarkers(chord: string) {
  const markers = voicings[chord] ?? voicings[canonicalChordLabel(chord)] ?? voicings.Am7;
  return markers;
}

function stringCenterPercent(string: number) {
  // Detail fretboard strings are rendered as six evenly spaced center lines.
  // String 6 low-E sits on top, string 1 high-e on the bottom.
  const topCenter = 16.27;
  const stringGap = 13.49;
  return topCenter + (6 - string) * stringGap;
}

function photoMarkerPosition(marker: NoteMarker) {
  return {
    left: `${((marker.fret - 0.5) / 16) * 100}%`,
    top: `${stringCenterPercent(marker.string)}%`
  };
}

function detailMarkerPosition(marker: NoteMarker) {
  return {
    left: `${((marker.fret - 0.5) / 12) * 100}%`,
    top: `${stringCenterPercent(marker.string)}%`
  };
}

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function ChordDiagram({ chord, degree, markers }: { chord: string; degree: string; markers: NoteMarker[] }) {
  const minFret = Math.min(...markers.map((marker) => marker.fret));
  const maxFret = Math.max(...markers.map((marker) => marker.fret));
  const baseFret = minFret <= 1 ? 1 : maxFret - minFret >= 5 ? Math.max(1, maxFret - 4) : minFret;

  return (
    <div className="chord-diagram-card" aria-label={`${chord} fingering diagram`}>
      <div className="diagram-title">
        <strong>{chord}</strong>
        <small>{degree}</small>
      </div>
      <div className="mini-diagram">
        {["E", "A", "D", "G", "B", "e"].map((stringName, index) => (
          <span className="mini-string" key={`${stringName}-${index}`} />
        ))}
        {Array.from({ length: 6 }).map((_, index) => (
          <span className="mini-fret" key={`fret-${index}`} />
        ))}
        {markers.map((marker, index) => {
          const localFret = marker.fret - baseFret + 1;
          return (
            <i
              className={markerClass(marker.interval)}
              key={`${marker.string}-${marker.fret}-${index}`}
              style={{
                left: `${((localFret - 0.5) / 5) * 100}%`,
                top: `${((6 - marker.string) / 5) * 100}%`
              }}
            >
              {marker.interval}
            </i>
          );
        })}
      </div>
      <small>{baseFret === 1 ? "Open position" : `Fret ${baseFret}`}</small>
    </div>
  );
}

export function GuitarWorkspace() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const analysisTimerRef = useRef<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [progressionText, setProgressionText] = useState(defaultProgression);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(72);
  const [loopMode, setLoopMode] = useState<LoopMode>("full");
  const [loopStart, setLoopStart] = useState(0);
  const [activeSkinId, setActiveSkinId] = useState(skins[1].id);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toneId, setToneId] = useState(tonePresets[0].id);
  const [paletteId, setPaletteId] = useState(markerPalettes[0].id);
  const [hasStarted, setHasStarted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [selectedSourceFile, setSelectedSourceFile] = useState<File | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisMessage, setAnalysisMessage] = useState("No recognition result yet.");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [liquidDomActive, setLiquidDomActive] = useState(false);
  const [keyChoice, setKeyChoice] = useState<"auto" | KeyName>("auto");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const progression = useMemo(() => parseProgression(progressionText), [progressionText]);
  const effectiveKey = useMemo<KeyName>(() => {
    if (keyChoice !== "auto") return keyChoice;
    if (activePresetId && presetKeys[activePresetId]) return presetKeys[activePresetId];
    return detectKey(progression);
  }, [activePresetId, keyChoice, progression]);
  const degrees = useMemo(
    () => progression.map((chord) => chordDegree(chord, effectiveKey)),
    [effectiveKey, progression]
  );
  const activeChord = progression[activeIndex] ?? progression[0] ?? "Am7";
  const activeDegree = degrees[activeIndex] ?? degrees[0] ?? "?";
  const markers = normalizeMarkers(activeChord);
  const beatMs = 60000 / bpm;
  const loopEnd = (loopStart + 1) % progression.length;
  const activeSkin = skins.find((skin) => skin.id === activeSkinId) ?? skins[0];
  const activeTone = tonePresets.find((tone) => tone.id === toneId) ?? tonePresets[0];
  const activePalette = markerPalettes.find((palette) => palette.id === paletteId) ?? markerPalettes[0];
  const handleLiquidActiveChange = useCallback((active: boolean) => {
    setLiquidDomActive(active);
  }, []);
  const guitarStyle = {
    aspectRatio: activeSkin.aspectRatio,
    "--fret-left": activeSkin.fretboard.left,
    "--fret-top": activeSkin.fretboard.top,
    "--fret-width": activeSkin.fretboard.width,
    "--fret-height": activeSkin.fretboard.height
  } as CSSProperties;
  const workspaceStyle = {
    "--amber-note": activePalette.root,
    "--green-note": activePalette.third,
    "--blue-note": activePalette.fifth,
    "--red-note": activePalette.seventh,
    "--violet-note": activePalette.extension
  } as CSSProperties;

  function getAudioContext() {
    if (typeof window === "undefined") return null;
    if (audioContextRef.current) return audioContextRef.current;

    const AudioContextCtor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return null;

    audioContextRef.current = new AudioContextCtor();
    return audioContextRef.current;
  }

  async function unlockAudioContext() {
    const context = getAudioContext();
    if (!context || context.state === "closed") return null;

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return null;
      }
    }

    if (!audioUnlockedRef.current && context.state === "running") {
      const unlockGain = context.createGain();
      const unlockOscillator = context.createOscillator();
      unlockGain.gain.setValueAtTime(0.00001, context.currentTime);
      unlockOscillator.connect(unlockGain);
      unlockGain.connect(context.destination);
      unlockOscillator.start(context.currentTime);
      unlockOscillator.stop(context.currentTime + 0.01);
      audioUnlockedRef.current = true;
    }

    return context;
  }

  async function playChordSound(chord: string, tone = activeTone, force = false) {
    if (!force && !soundEnabled) return;

    const context = await unlockAudioContext();
    if (!context) return;
    if (context.state !== "running") return;

    const now = context.currentTime + 0.02;
    const chordMarkers = normalizeMarkers(chord);

    chordMarkers.forEach((marker, index) => {
      const midi = openStringMidi[marker.string] + marker.fret;
      const start = now + index * 0.018;
      const oscillator = context.createOscillator();
      const body = context.createOscillator();
      const gain = context.createGain();
      const bodyGain = context.createGain();
      const filter = context.createBiquadFilter();

      oscillator.type = tone.oscillator;
      body.type = "sine";
      oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
      oscillator.detune.setValueAtTime(tone.detune, start);
      body.frequency.setValueAtTime(midiToFrequency(midi) * 0.5, start);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(tone.filter, start);
      filter.Q.setValueAtTime(0.75, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.decay);
      bodyGain.gain.setValueAtTime(0.0001, start);
      bodyGain.gain.exponentialRampToValueAtTime(tone.gain * 0.22, start + 0.03);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + tone.decay * 0.9);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      body.connect(bodyGain);
      bodyGain.connect(context.destination);
      oscillator.start(start);
      body.start(start);
      oscillator.stop(start + tone.decay + 0.05);
      body.stop(start + tone.decay + 0.05);
    });
  }

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        if (loopMode === "hold") return current;
        if (loopMode === "pair") return current === loopStart ? loopEnd : loopStart;
        return (current + 1) % progression.length;
      });
    }, beatMs * 2);

    return () => window.clearInterval(timer);
  }, [beatMs, isPlaying, loopEnd, loopMode, loopStart, progression.length]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, progression.length - 1));
    setLoopStart((current) => Math.min(current, progression.length - 1));
  }, [progression.length]);

  useEffect(() => {
    if (isPlaying) playChordSound(activeChord);
  }, [activeChord, isPlaying]);

  useEffect(() => {
    return () => {
      if (analysisTimerRef.current) window.clearTimeout(analysisTimerRef.current);
    };
  }, []);

  function arrangeProgression() {
    setHasStarted(true);
    setSettingsOpen(false);
    setActiveIndex(0);
    setLoopStart(0);
    setIsFocused(true);
    setIsPlaying(true);
    playChordSound(progression[0] ?? activeChord);
  }

  function step(direction: number) {
    setActiveIndex((current) => {
      if (loopMode === "pair") {
        return current === loopStart ? loopEnd : loopStart;
      }

      const next = (current + direction + progression.length) % progression.length;
      if (loopMode === "hold") setLoopStart(next);
      return next;
    });
  }

  function togglePlayback() {
    setHasStarted(true);
    setIsFocused(true);
    setIsPlaying((value) => {
      if (!value) playChordSound(activeChord);
      return !value;
    });
  }

  function selectChord(index: number) {
    setActiveIndex(index);
    if (loopMode !== "full") setLoopStart(index);
    playChordSound(progression[index] ?? activeChord);
  }

  function selectChartChord(chord: string) {
    const index = progression.findIndex((item) => item === chord);
    selectChord(index >= 0 ? index : 0);
  }

  function selectLoopMode(mode: LoopMode) {
    setLoopMode(mode);
    if (mode !== "full") setLoopStart(activeIndex);
  }

  function selectProgressionPreset(preset: ProgressionPreset) {
    setProgressionText(preset.value);
    setActivePresetId(preset.id);
    setAnalysisResult(null);
    setAnalysisState("idle");
    setAnalysisMessage("Practice progression selected.");
    setActiveIndex(0);
    setLoopStart(0);
    if (hasStarted) playChordSound(parseProgression(preset.value)[0] ?? activeChord);
  }

  function applyRecognizedSong(result: AnalysisResult) {
    const recognizedProgression = parseProgression(result.progression);
    setAnalysisResult(result);
    setAnalysisState("ready");
    setAnalysisMessage(`${Math.round(result.confidence * 100)}% confidence draft`);
    setProgressionText(result.progression);
    setActivePresetId(null);
    setBpm(result.bpm);
    setActiveIndex(0);
    setLoopStart(0);
    setHasStarted(true);
    setIsFocused(true);
    setIsPlaying(true);
    playChordSound(recognizedProgression[0] ?? activeChord);
  }

  async function runRecognition(kind: "chart" | "audio") {
    if (analysisTimerRef.current) window.clearTimeout(analysisTimerRef.current);

    setAnalysisState("analyzing");
    setAnalysisResult(null);

    if (kind === "chart") {
      setAnalysisMessage("Scanning chart layout and chord symbols...");
      analysisTimerRef.current = window.setTimeout(() => {
        applyRecognizedSong(chartRecognitionDraft);
      }, 760);
      return;
    }

    if (!selectedSourceFile) {
      setAnalysisState("error");
      setAnalysisMessage("Upload an MP3 first. FretFlow will run our audio engine on that file.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("audio", selectedSourceFile);

      const response = await fetch("/api/analyze-audio", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok || !payload.result) {
        setAnalysisState("error");
        setAnalysisMessage(payload.message ?? "FretFlow audio engine is warming up.");
        return;
      }

      applyRecognizedSong(payload.result as AnalysisResult);
    } catch {
      setAnalysisState("error");
      setAnalysisMessage("FretFlow audio engine request failed. No fallback practice chords were used.");
    }
  }

  function exportChordChart() {
    if (!analysisResult || typeof window === "undefined") return;

    const chartText = [
      `${analysisResult.title}`,
      `${analysisResult.source} · ${analysisResult.key} · ${analysisResult.bpm} BPM · ${Math.round(analysisResult.confidence * 100)}% confidence`,
      "",
      ...analysisResult.sections.flatMap((section) => [
        `[${section.name}]`,
        ...section.bars.map((bar, index) => `${index + 1}. ${bar.join("  ")}`),
        ""
      ])
    ].join("\n");
    const blob = new Blob([chartText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${analysisResult.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "chord-chart"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function startPractice() {
    setHasStarted(true);
    setSettingsOpen(false);
    setIsFocused(true);
    setIsPlaying(true);
    playChordSound(activeChord);
  }

  function isInsideLoop(index: number) {
    if (loopMode === "full") return true;
    if (loopMode === "hold") return index === activeIndex;
    return index === loopStart || index === loopEnd;
  }

  return (
    <main
      className={`workspace-shell ${isFocused ? "is-focused" : ""} ${hasStarted ? "has-started" : ""} ${settingsOpen ? "settings-open" : ""} ${liquidDomActive ? "liquid-dom-active" : ""}`}
      style={workspaceStyle}
      onPointerDownCapture={() => {
        if (soundEnabled) void unlockAudioContext();
      }}
    >
      <LiquidChrome
        hasStarted={hasStarted}
        isFocused={isFocused}
        settingsOpen={settingsOpen}
        onActiveChange={handleLiquidActiveChange}
      />

      {!hasStarted ? (
        <section className="landing-panel">
          <p>FretFlow</p>
          <h1>Animated fretboard memory for advanced guitar chords.</h1>
          <span>Paste chords, import a chart, or turn an MP3 into a playable guitar chord map.</span>
          <div>
            <button onClick={startPractice}>Start practice</button>
            <button
              className="landing-secondary"
              onClick={() => {
                setInputMode("audio");
                setSettingsOpen(true);
              }}
            >
              Analyze song
            </button>
          </div>
        </section>
      ) : null}

      <header className="app-header">
        <div>
          <p>FretFlow</p>
          <h1>Learn chord motion on the instrument itself.</h1>
        </div>
        <button className="soft-button" onClick={() => setIsFocused((value) => !value)}>
          {isFocused ? "Show guitar" : "Focus fretboard"}
        </button>
      </header>

      {hasStarted ? (
        <div className="session-toolbar">
          <button onClick={() => step(-1)}>Prev</button>
          <strong>{activeChord}</strong>
          <span className="toolbar-degree">{activeDegree}</span>
          <button className="toolbar-primary" onClick={togglePlayback}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button onClick={() => step(1)}>Next</button>
          <button onClick={() => setSettingsOpen((value) => !value)}>
            {settingsOpen ? "Hide settings" : "Settings"}
          </button>
        </div>
      ) : null}

      <section className={`instrument-stage ${isPlaying ? "is-playing" : ""}`} aria-label="Interactive guitar stage">
        <motion.div
          className="guitar-model"
          style={guitarStyle}
          animate={isFocused ? "focused" : "idle"}
          variants={{
            idle: hasStarted
              ? { scale: 1, x: 0, y: 0, rotate: 0 }
              : { scale: 0.84, x: "10vw", y: 56, rotate: 0 },
            focused: { scale: 1.1, x: "17vw", y: 58, rotate: 0 }
          }}
          transition={{ type: "spring", stiffness: 72, damping: 19, mass: 0.9 }}
        >
          <img
            className="guitar-photo"
            src={activeSkin.src}
            alt={activeSkin.alt}
            draggable={false}
          />

          <button className="fretboard-hit-area" onClick={() => setIsFocused(true)} aria-label="Zoom into fretboard">
            <div className="photo-fretboard">
              <div className="focus-sheen" />
              {hasStarted && !isFocused ? (
                <AnimatePresence mode="popLayout">
                  {markers.map((marker, index) => (
                    <motion.span
                      className={`photo-note note-marker ${markerClass(marker.interval)}`}
                      key={`photo-marker-${index}`}
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        ...photoMarkerPosition(marker)
                      }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    >
                      {marker.interval}
                    </motion.span>
                  ))}
                </AnimatePresence>
              ) : null}
            </div>
          </button>
        </motion.div>

        <AnimatePresence>
          {isFocused ? (
            <motion.div
              className="fretboard-detail-layer"
              initial={{ opacity: 0, x: "-50%", y: 28, scale: 0.96 }}
              animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
              exit={{ opacity: 0, x: "-50%", y: 24, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 110, damping: 20 }}
            >
              <div className="detail-ruler">
                {Array.from({ length: 12 }).map((_, index) => (
                  <span key={index}>{index + 1}</span>
                ))}
              </div>
              <div className="detail-fretboard" aria-label="Focused fretboard template">
                <div className="nut" />
                <div className="detail-strings">
                  {["E", "A", "D", "G", "B", "e"].map((stringName, index) => (
                    <span key={`${stringName}-${index}`}>
                      <small>{stringName}</small>
                    </span>
                  ))}
                </div>
                <div className="detail-frets">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <i key={index} />
                  ))}
                </div>
                <div className="detail-inlays">
                  {[3, 5, 7, 9, 12].map((fret) => (
                    <b key={fret} style={{ left: `${((fret - 0.5) / 12) * 100}%` }} />
                  ))}
                </div>
                <AnimatePresence mode="popLayout">
                  {markers.map((marker, index) => (
                    <motion.span
                      className={`detail-note note-marker ${markerClass(marker.interval)}`}
                      key={`detail-marker-${index}`}
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        ...detailMarkerPosition(marker)
                      }}
                      exit={{ opacity: 0, scale: 0.65 }}
                      transition={{ type: "spring", stiffness: 280, damping: 24 }}
                    >
                      {marker.interval}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {hasStarted ? <ChordDiagram chord={activeChord} degree={activeDegree} markers={markers} /> : null}
      </section>

      {hasStarted ? (
        <div className="stage-progression" aria-label="Progression harmonic map">
          <span className="stage-key">
            Key {effectiveKey}
            {keyChoice === "auto" ? <small>auto</small> : null}
          </span>
          {progression.map((chord, index) => (
            <button
              className={index === activeIndex ? "active" : ""}
              key={`stage-${chord}-${index}`}
              onClick={() => selectChord(index)}
            >
              <span>{chord}</span>
              <small>{degrees[index]}</small>
            </button>
          ))}
        </div>
      ) : null}

      <AnimatePresence>
      {settingsOpen ? (
      <motion.aside
        className={`input-dock ${hasStarted ? "settings-dock" : ""}`}
        layout
        initial={hasStarted ? { opacity: 0, y: 24 } : false}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
      >
        <div className="dock-heading">
          <div>
            <p>Import source</p>
            <h2>Build a playable chord chart.</h2>
          </div>
          <div className="segmented">
            <button className={inputMode === "text" ? "active" : ""} onClick={() => setInputMode("text")}>
              Text
            </button>
            <button className={inputMode === "chart" ? "active" : ""} onClick={() => setInputMode("chart")}>
              Sheet
            </button>
            <button className={inputMode === "audio" ? "active" : ""} onClick={() => setInputMode("audio")}>
              MP3 Pro
            </button>
          </div>
        </div>

        {inputMode === "text" ? (
          <textarea
            aria-label="Chord progression"
            value={progressionText}
            onChange={(event) => {
              setProgressionText(event.target.value);
              setActivePresetId(null);
              setAnalysisResult(null);
              setAnalysisState("idle");
            }}
          />
        ) : null}

        {inputMode === "chart" ? (
          <div className="source-panel">
            <label className="upload-well">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedSourceFile(file);
                  setUploadedFileName(file?.name ?? "");
                  setAnalysisState("idle");
                  setAnalysisMessage("Ready to scan chart.");
                }}
              />
              <span>{uploadedFileName || "Drop a chord chart screenshot or PDF"}</span>
              <small>OCR cleans the chart, normalizes symbols, then maps each chord to the fretboard.</small>
            </label>
            <button className="recognize-action" onClick={() => runRecognition("chart")}>
              Recognize sheet
            </button>
          </div>
        ) : null}

        {inputMode === "audio" ? (
          <div className="source-panel">
            <label className="upload-well premium-upload">
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedSourceFile(file);
                  setUploadedFileName(file?.name ?? "");
                  setAnalysisState("idle");
                  setAnalysisMessage(file ? "Ready for FretFlow audio analysis." : "Upload an MP3 first.");
                }}
              />
              <span>{uploadedFileName || "Upload MP3 audio"}</span>
              <small>Paid advanced: upload MP3, then FretFlow analyzes the song and returns an editable chart.</small>
            </label>
            <button className="recognize-action premium-action" onClick={() => runRecognition("audio")}>
              Analyze MP3
            </button>
          </div>
        ) : null}

        {inputMode === "text" ? (
          <div className="preset-library" aria-label="Progression library">
            {progressionPresets.map((preset) => (
              <button key={preset.id} onClick={() => selectProgressionPreset(preset)}>
                <small>{preset.style}</small>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={`analysis-panel ${analysisState}`} aria-label="Recognition result">
            <div>
              <p>{inputMode === "audio" ? "MP3 chord engine" : "Sheet recognition"}</p>
              <strong>
                {analysisState === "analyzing"
                  ? "Analyzing..."
                  : analysisState === "error"
                    ? "Analysis pending"
                  : analysisResult
                    ? `${analysisResult.key} · ${analysisResult.bpm} BPM`
                    : "Ready to scan"}
              </strong>
            </div>
            <span>{analysisResult ? `${Math.round(analysisResult.confidence * 100)}% confidence draft` : analysisMessage}</span>
          </div>
        )}

        <div className="utility-row">
          <div className="skin-picker" aria-label="Guitar skin picker">
            {skins.map((skin) => (
              <button
                className={skin.id === activeSkinId ? "active" : ""}
                key={skin.id}
                onClick={() => setActiveSkinId(skin.id)}
              >
                <img src={skin.src} alt="" />
                <span>{skin.name}</span>
              </button>
            ))}
          </div>
          <button
            className={`sound-toggle ${soundEnabled ? "active" : ""}`}
            onClick={() => {
              const nextSoundEnabled = !soundEnabled;
              setSoundEnabled(nextSoundEnabled);
              if (nextSoundEnabled) playChordSound(activeChord, activeTone, true);
            }}
          >
            {soundEnabled ? "Sound on" : "Sound off"}
          </button>
        </div>

        <div className="tone-picker" aria-label="Tone picker">
          {tonePresets.map((tone) => (
            <button
              className={tone.id === toneId ? "active" : ""}
              key={tone.id}
              onClick={() => {
                setToneId(tone.id);
                if (soundEnabled) playChordSound(activeChord, tone);
              }}
            >
              {tone.name}
            </button>
          ))}
        </div>

        <div className="color-picker" aria-label="Marker color picker">
          {markerPalettes.map((palette) => (
            <button
              className={palette.id === paletteId ? "active" : ""}
              key={palette.id}
              onClick={() => setPaletteId(palette.id)}
            >
              <span
                style={{
                  background: `linear-gradient(90deg, ${palette.root} 0 20%, ${palette.third} 20% 40%, ${palette.fifth} 40% 60%, ${palette.seventh} 60% 80%, ${palette.extension} 80% 100%)`
                }}
              />
              {palette.name}
            </button>
          ))}
        </div>

        <div className="progression-row">
          {progression.map((chord, index) => (
            <button
              className={index === activeIndex ? "active" : ""}
              key={`${chord}-${index}`}
              onClick={() => selectChord(index)}
            >
              {chord}
            </button>
          ))}
        </div>

        <div className="motion-strip" aria-label="Progression playback timeline">
          {progression.map((chord, index) => (
            <button
              className={`${index === activeIndex ? "active" : ""} ${isInsideLoop(index) ? "in-loop" : ""}`}
              key={`step-${chord}-${index}`}
              onClick={() => selectChord(index)}
            >
              <span>{chord}</span>
              <small>{degrees[index]}</small>
              {index === activeIndex ? (
                <motion.i
                  layoutId="active-step"
                  transition={{ type: "spring", stiffness: 220, damping: 26 }}
                />
              ) : null}
            </button>
          ))}
        </div>

        <div className="loop-controls" aria-label="Loop controls">
          <span>Loop</span>
          <button className={loopMode === "full" ? "active" : ""} onClick={() => selectLoopMode("full")}>
            Full
          </button>
          <button className={loopMode === "pair" ? "active" : ""} onClick={() => selectLoopMode("pair")}>
            A/B
          </button>
          <button className={loopMode === "hold" ? "active" : ""} onClick={() => selectLoopMode("hold")}>
            Hold
          </button>
          <strong>
            {loopMode === "full"
              ? "All chords"
              : loopMode === "pair"
                ? `${progression[loopStart]} <-> ${progression[loopEnd]}`
                : progression[activeIndex]}
          </strong>
        </div>

        <div className="key-row" aria-label="Key selector">
          <span>Key</span>
          <select
            aria-label="Progression key"
            value={keyChoice}
            onChange={(event) => setKeyChoice(event.target.value as "auto" | KeyName)}
          >
            <option value="auto">Auto</option>
            {KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <strong>{keyChoice === "auto" ? `Auto · ${effectiveKey}` : effectiveKey}</strong>
        </div>

        <div className="dock-actions">
          <button className="secondary-action" onClick={() => step(-1)}>
            Previous
          </button>
          <button className="primary-action" onClick={togglePlayback}>
            {isPlaying ? "Pause motion" : "Play motion"}
          </button>
          <button className="secondary-action" onClick={() => step(1)}>
            Next
          </button>
        </div>

        <div className="tempo-control">
          <span>{bpm} BPM</span>
          <input
            aria-label="Playback tempo"
            type="range"
            min="48"
            max="132"
            value={bpm}
            onChange={(event) => setBpm(Number(event.target.value))}
          />
          <button onClick={arrangeProgression}>Arrange + play</button>
        </div>

        {analysisResult ? (
          <div className="song-chart" aria-label="Generated song chord chart">
            <header>
              <div>
                <p>{analysisResult.source}</p>
                <strong>{analysisResult.title}</strong>
              </div>
              <button onClick={exportChordChart}>Export chart</button>
            </header>
            <div className="chart-sections">
              {analysisResult.sections.map((section) => (
                <section key={section.name}>
                  <h3>{section.name}</h3>
                  <div>
                    {section.bars.map((bar, index) => (
                      <button key={`${section.name}-${index}`} onClick={() => selectChartChord(bar[0])}>
                        <small>{index + 1}</small>
                        <span>{bar.join("  ")}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </motion.aside>
      ) : null}
      </AnimatePresence>
    </main>
  );
}
