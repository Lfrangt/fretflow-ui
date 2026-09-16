"use client";

import { useLanguage, LanguageSwitcher } from "./language-provider";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { dreamGuitars } from "@/lib/dream-guitars";
import { rightHandedStringPosition } from "@/lib/guitar-layout";
import { MediaTranscription } from "./media-transcription";
import { TestFeedback } from "./test-feedback";
import { ToneGuide } from "./tone-guide";
import { ChordFinder } from "./chord-finder";
import { ScoreImport } from "./score-import";
import type { ImportedChart } from "@/lib/score-import";
import { FingeringPanel } from "./fingering-panel";
import { suggestedVoicing, voicingCandidates, connectVoicings, PRACTICE_RANGE, type FretRange } from "@/lib/guitar-voicing";
import { ChordThumbnail } from "./chord-thumbnail";
import { GuitarStage } from "./guitar-stage";
import { WorkspaceSheet } from "./workspace-sheet";
import { WorkspaceIcon, type IconName } from "./workspace-icon";
import type { KeyName } from "@/lib/harmony";
import { KEYS, chordDegree, detectKey, presetKeys } from "@/lib/harmony";
import { practicePerformance, soundingMidi, midiName, notePositions, type PracticePerformance } from "@/lib/practice-performance";
import { usePracticePerformance } from "./use-practice-performance";
import { usePracticeRecording } from "./use-practice-recording";
import { prepareAudioPlayback, resumeAudioPlayback } from "@/lib/audio-playback";

type NoteMarker = {
  string: number;
  fret: number;
  interval: string;
  finger: number;
};

type LoopMode = "full" | "pair" | "hold";
type InputMode = "chart" | "audio";
type Panel = "chord-finder" | "edit" | "settings" | "presets" | "import" | "score-import" | "fingering" | "loop" | "sound" | "appearance" | "key" | "chart" | "guitar" | "harmony";
type AnalysisState = "idle" | "analyzing" | "ready" | "error";

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

const defaultProgression = "Cm9  F13  Bbmaj9  G7alt";

const progressionPresets: ProgressionPreset[] = [
  { id: "neo-soul", name: "Neo-Soul ii V I VI", style: "R&B", value: "Cm9  F13  Bbmaj9  G7alt" },
  { id: "jazz-turnaround", name: "Jazz ii V I Turnaround", style: "Jazz", value: "Dm9  G13  Cmaj9  A7b13" },
  { id: "backdoor", name: "Backdoor Color Move", style: "Neo-Soul", value: "Cmaj9  Eb9  Abmaj13  Db13" },
  { id: "dominant-blues", name: "Dominant Blues Cycle", style: "Blues", value: "F13  Bb13  F13  C9  Bb13  F7#9" },
  { id: "minor-soul", name: "Minor Soul Release", style: "R&B", value: "F#m11  B13  Emaj9  C#7alt" },
  { id: "dim-passing", name: "Diminished Passing", style: "Jazz", value: "Am9  Abdim7  Gm9  C13" }
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

function noteInk(hex: string) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  return luminance > .179 ? "#171611" : "#fffdf7";
}

function parseProgression(value: string) {
  const chords = value
    .split(/[\s,|>-]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return chords;
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
  const markers = voicings[chord] ?? voicings[canonicalChordLabel(chord)] ?? suggestedVoicing(chord);
  return markers;
}

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function ChordDiagram({ chord, degree, markers }: { chord: string; degree: string; markers: NoteMarker[] }) {
  const { t, localize } = useLanguage();
  if (!markers.length) return <div className="chord-diagram-card">{chord} · {t("Fingering needs review")}</div>;
  const minFret = Math.min(...markers.map((marker) => marker.fret));
  const maxFret = Math.max(...markers.map((marker) => marker.fret));
  const baseFret = minFret <= 1 ? 1 : maxFret - minFret >= 5 ? Math.max(1, maxFret - 4) : minFret;

  return (
    <div className="chord-diagram-card" aria-label={t("{chord} fingering diagram", { chord })}>
      <div className="diagram-title">
        <strong>{chord}</strong>
        <small>{degree}</small>
      </div>
      <div className="mini-diagram">
        {["e", "B", "G", "D", "A", "E"].map((stringName, index) => (
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
                top: `${rightHandedStringPosition(marker.string) * 100}%`
              }}
            >
              {marker.interval}
            </i>
          );
        })}
      </div>
      <small>{baseFret === 1 ? t("Open position") : t("Fret {fret}", { fret: baseFret })}</small>
    </div>
  );
}

export function GuitarWorkspace() {
  const { t, localize } = useLanguage();
  const audioContextRef = useRef<AudioContext | null>(null);
  const chordVoicesRef = useRef(new Set<OscillatorNode>());
  const audioUnlockedRef = useRef(false);
  const analysisRequestRef = useRef<AbortController | null>(null);
  const chordStripRef = useRef<HTMLDivElement>(null);
  const activeChordRef = useRef<HTMLButtonElement>(null);
  const playbackPositionRef = useRef({ progression: defaultProgression, index: 0, fraction: 0 });
  const [isFocused, setIsFocused] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("audio");
  const [progressionText, setProgressionText] = useState(defaultProgression);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(72);
  const [loopMode, setLoopMode] = useState<LoopMode>("full");
  const [loopStart, setLoopStart] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [toneId, setToneId] = useState(tonePresets[0].id);
  const [paletteId, setPaletteId] = useState(markerPalettes[0].id);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);
  const [importedHarmony, setImportedHarmony] = useState<{ progression: string; key: string; degrees: string[] } | null>(null);
  const [importedTiming, setImportedTiming] = useState<{ progression: string; beats: number[] } | null>(null);
  const [importedChart, setImportedChart] = useState<{ progression: string; title: string; steps: ImportedChart["steps"]; source: ImportedChart["source"] } | null>(null);
  const [fretRange, setFretRange] = useState<FretRange>(PRACTICE_RANGE);
  const [pinnedShapes, setPinnedShapes] = useState<{ progression: string; shapes: Record<number, NoteMarker[]> }>({ progression: "", shapes: {} });
  const [finderShape, setFinderShape] = useState<NoteMarker[]>([]);
  const [toneStopToken, setToneStopToken] = useState(0);
  const [referenceVideo, setReferenceVideo] = useState<File | null>(null);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("fretflow-fret-range") || "null");
      if (saved && [[0,5],[5,12],[8,17]].some(([min,max]) => saved.min === min && saved.max === max)) setFretRange(saved);
    } catch { /* Defaults remain available without storage. */ }
  }, []);
  function chooseFretRange(range: FretRange) {
    setIsPlaying(false); setFretRange(range);
    try { localStorage.setItem("fretflow-fret-range", JSON.stringify(range)); } catch { /* Keep this session. */ }
  }
  const [importedPerformance, setImportedPerformance] = useState<{ progression: string; data: PracticePerformance } | null>(null);
  const [performanceMode, setPerformanceMode] = useState<"original" | "notes" | "chords">("notes");
  const [playingMidis, setPlayingMidis] = useState<number[]>([]);
  const [draftText, setDraftText] = useState(defaultProgression);
  const [draftPresetId, setDraftPresetId] = useState<string | null>(null);
  const [draftBpm, setDraftBpm] = useState<number | null>(null);
  const [draftError, setDraftError] = useState<{ message: string; values?: Record<string, string> } | null>(null);
  const [showDiagram, setShowDiagram] = useState(false);
  const [guitarId, setGuitarId] = useState(dreamGuitars[0].id);
  const [guitarFamily, setGuitarFamily] = useState("All");
  const activeGuitar = dreamGuitars.find(guitar => guitar.id === guitarId) ?? dreamGuitars[0];
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fretflow:dream-guitar");
      if (dreamGuitars.some(guitar => guitar.id === saved)) setGuitarId(saved!);
    } catch { /* Selection still works when browser storage is unavailable. */ }
  }, []);
  function chooseGuitar(id: string) {
    setGuitarId(id);
    try { localStorage.setItem("fretflow:dream-guitar", id); } catch { /* Keep the current-session choice. */ }
  }
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [selectedSourceFile, setSelectedSourceFile] = useState<File | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisMessage, setAnalysisMessage] = useState("No recognition result yet.");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [keyChoice, setKeyChoice] = useState<"auto" | KeyName>("auto");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const progression = useMemo(() => parseProgression(progressionText), [progressionText]);
  const effectiveKey = useMemo<KeyName>(() => {
    if (keyChoice !== "auto") return keyChoice;
    if (activePresetId && presetKeys[activePresetId]) return presetKeys[activePresetId];
    return detectKey(progression);
  }, [activePresetId, keyChoice, progression]);
  const degrees = useMemo(
    () => importedHarmony?.progression === progressionText ? importedHarmony.degrees : progression.map((chord) => chord === "N.C." ? "—" : chordDegree(chord, effectiveKey)),
    [effectiveKey, progression, importedHarmony, progressionText]
  );
  const displayedKey = importedHarmony?.progression === progressionText ? importedHarmony.key : effectiveKey;
  const activeChord = progression[activeIndex] ?? progression[0] ?? "Am7";
  const activeDegree = degrees[activeIndex] ?? degrees[0] ?? "?";
  const chartSteps = importedChart?.progression === progressionText ? importedChart.steps : null;
  const choicesByChord = useMemo(() => new Map([...new Set(progression)].map(chord => [chord, voicingCandidates(chord, fretRange, voicings[chord] ?? [])])), [progression, fretRange]);
  const connectedShapes = useMemo(() => connectVoicings(progression.map((chord, index) => {
    const pinned = pinnedShapes.progression === progressionText ? pinnedShapes.shapes[index] : undefined;
    const source = chartSteps?.[index]?.sourceShape;
    return pinned ? [pinned] : source ? [source] : choicesByChord.get(chord) ?? [];
  })), [progression, progressionText, pinnedShapes, chartSteps, choicesByChord]);
  const markers = connectedShapes[activeIndex] ?? [];
  const chordReferenceTime = performanceDataTime();
  function performanceDataTime() {
    const data = importedPerformance?.progression === progressionText ? importedPerformance.data : null;
    if (data) return data.sourceStart + data.offset + (data.chords[activeIndex]?.start ?? 0);
    return progression.slice(0, activeIndex).reduce((sum, _, i) => sum + (importedTiming?.progression === progressionText ? importedTiming.beats[i] ?? 2 : 2), 0) * 60 / bpm;
  }
  const beatMs = 60000 / bpm;
  const chordDurationMs = beatMs * (importedTiming?.progression === progressionText ? importedTiming.beats[activeIndex] ?? 2 : 2);
  const loopEnd = (loopStart + 1) % progression.length;
  const activeTone = tonePresets.find((tone) => tone.id === toneId) ?? tonePresets[0];
  const activePalette = markerPalettes.find((palette) => palette.id === paletteId) ?? markerPalettes[0];
  const performanceData = importedPerformance?.progression === progressionText ? importedPerformance.data : null;
  const followsOriginal = Boolean(performanceData?.originalUrl && performanceMode === "original");
  const followsNotes = Boolean(performanceData?.notes.length && performanceMode === "notes");
  const followsPerformance = followsOriginal || followsNotes;
  const noteAudio = usePracticePerformance(performanceData, {
    playing: isPlaying, enabled: followsNotes, audible: soundEnabled, bpm,
    loop: loopMode, loopStart, onChord: setActiveIndex,
    onNotes: midis => setPlayingMidis(previous => previous.join() === midis.join() ? previous : midis),
    onError: () => setIsPlaying(false)
  });
  const originalAudio = usePracticeRecording(performanceData, {
    playing: isPlaying, enabled: followsOriginal, audible: soundEnabled, bpm,
    loop: loopMode, loopStart, onChord: setActiveIndex, onError: () => setIsPlaying(false)
  });
  const performanceAudio = followsOriginal ? originalAudio : noteAudio;
  const playbackLabel = followsOriginal ? "Original recording" : followsNotes ? "Synthesized guitar" : activeTone.name;
  const playedPositions = useMemo(() => notePositions(playingMidis, performanceData?.tuning, fretRange), [playingMidis, performanceData?.tuning, fretRange]);
  const workspaceStyle = {
    "--amber-note": activePalette.root,
    "--green-note": activePalette.third,
    "--blue-note": activePalette.fifth,
    "--red-note": activePalette.seventh,
    "--violet-note": activePalette.extension,
    "--amber-ink": noteInk(activePalette.root),
    "--green-ink": noteInk(activePalette.third),
    "--blue-ink": noteInk(activePalette.fifth),
    "--red-ink": noteInk(activePalette.seventh),
    "--violet-ink": noteInk(activePalette.extension)
  } as CSSProperties;

  function getAudioContext() {
    if (typeof window === "undefined") return null;
    if (audioContextRef.current?.state !== "closed" && audioContextRef.current) return audioContextRef.current;

    const AudioContextCtor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return null;

    prepareAudioPlayback();
    audioContextRef.current = new AudioContextCtor();
    audioUnlockedRef.current = false;
    audioContextRef.current.onstatechange = () => {
      const state = audioContextRef.current?.state;
      if (state && state !== "running" && state !== "closed") setIsPlaying(false);
    };
    return audioContextRef.current;
  }

  async function unlockAudioContext(signal?: AbortSignal) {
    let context: AudioContext | null;
    try { context = getAudioContext(); } catch { return null; }
    if (!context || context.state === "closed") return null;
    if (!await resumeAudioPlayback(context, signal)) return null;

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

  async function playChordSound(chord: string, tone = activeTone, force = false, index = activeIndex, signal?: AbortSignal, previewShape?: NoteMarker[]) {
    if (!force && !soundEnabled) return;
    setToneStopToken(token => token + 1);

    const context = await unlockAudioContext(signal);
    // Editing, pausing or changing chords invalidates a pending audio resume.
    if (signal?.aborted) return;
    if (!context) { setAudioBlocked(true); setIsPlaying(false); return; }
    if (context.state !== "running") return;
    setAudioBlocked(false);

    const now = context.currentTime + 0.02;
    const chordMarkers = previewShape ?? connectedShapes[index] ?? [];

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
      for (const voice of [oscillator, body]) {
        chordVoicesRef.current.add(voice);
        voice.onended = () => { chordVoicesRef.current.delete(voice); voice.disconnect(); };
      }
      oscillator.stop(start + tone.decay + 0.05);
      body.stop(start + tone.decay + 0.05);
    });
  }

  useEffect(() => {
    // Stop residual preview voices before handing sound to another transport.
    for (const voice of chordVoicesRef.current) { try { voice.stop(); } catch { /* Already ended. */ } }
    chordVoicesRef.current.clear();
  }, [performanceMode, transcriptionOpen, isPlaying, soundEnabled]);

  useEffect(() => {
    const position = playbackPositionRef.current;
    if (position.progression !== progressionText || position.index !== activeIndex) {
      position.progression = progressionText;
      position.index = activeIndex;
      position.fraction = 0;
    }
    if (followsPerformance || !isPlaying || loopMode === "hold" || progression.length < 2) return;

    const startedAt = performance.now();
    const startFraction = position.fraction;
    let completed = false;
    const timer = window.setTimeout(() => {
      completed = true;
      position.fraction = 0;
      setActiveIndex((current) => {
        if (loopMode === "pair") return current === loopStart ? loopEnd : loopStart;
        return (current + 1) % progression.length;
      });
    }, chordDurationMs * (1 - startFraction));

    return () => {
      window.clearTimeout(timer);
      // Keep our place within the chord when pausing or changing tempo.
      if (!completed) position.fraction = Math.min(1, startFraction + (performance.now() - startedAt) / chordDurationMs);
    };
  }, [activeIndex, chordDurationMs, followsPerformance, isPlaying, loopEnd, loopMode, loopStart, progression.length, progressionText]);

  useEffect(() => {
    const strip = chordStripRef.current;
    const chord = activeChordRef.current;
    if (!strip || !chord) return;

    function followChord(behavior: ScrollBehavior) {
      if (!strip || !chord) return;
      const stripBounds = strip.getBoundingClientRect();
      const chordBounds = chord.getBoundingClientRect();
      const left = strip.scrollLeft + chordBounds.left - stripBounds.left - strip.clientLeft
        + chordBounds.width / 2 - strip.clientWidth / 2;
      const target = Math.max(0, Math.min(left, strip.scrollWidth - strip.clientWidth));
      // Scroll only the chord strip, leaving the guitar and page in place.
      // Jump directly when wrapping a long song instead of sweeping past every chord.
      strip.scrollTo({ left: target, behavior: Math.abs(target - strip.scrollLeft) > strip.clientWidth ? "instant" : behavior });
    }

    followChord(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth");
    let width = strip.clientWidth;
    const observer = new ResizeObserver(() => {
      if (strip.clientWidth === width) return;
      width = strip.clientWidth;
      followChord("instant");
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [activeIndex, isPlaying, progressionText]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, progression.length - 1));
    setLoopStart((current) => Math.min(current, progression.length - 1));
  }, [progression.length]);

  useEffect(() => {
    const playback = new AbortController();
    if (isPlaying && !followsPerformance && soundEnabled) void playChordSound(activeChord, activeTone, false, activeIndex, playback.signal);
    return () => playback.abort();
  }, [activeChord, activeIndex, followsPerformance, isPlaying, soundEnabled]);

  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setIsPlaying(false); };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  useEffect(() => {
    return () => {
      analysisRequestRef.current?.abort();
      void audioContextRef.current?.close();
    };
  }, []);

  function step(direction: number) {
    if (followsPerformance) {
      const index = loopMode === "pair" ? activeIndex === loopStart ? loopEnd : loopStart : (activeIndex + direction + progression.length) % progression.length;
      setActiveIndex(index);
      if (loopMode === "hold") setLoopStart(index);
      performanceAudio.seekChord(index);
      return;
    }
    setActiveIndex((current) => {
      if (loopMode === "pair") {
        return current === loopStart ? loopEnd : loopStart;
      }

      const next = (current + direction + progression.length) % progression.length;
      if (loopMode === "hold") setLoopStart(next);
      return next;
    });
  }

  function switchPlaybackMode(mode: "original" | "notes" | "chords") {
    if (mode === performanceMode || !performanceData) return;
    const time = followsPerformance ? performanceAudio.getTime() : performanceData.chords[activeIndex]?.start ?? 0;
    // An explicit pause prevents two outputs from briefly sounding during handoff.
    noteAudio.pauseNow(); originalAudio.pauseNow(); setIsPlaying(false);
    noteAudio.seekTime(time); originalAudio.seekTime(time);
    setPlayingMidis(soundingMidi(performanceData, time));
    setPerformanceMode(mode);
    if (mode === "original") setBpm(value => Math.max(performanceData.bpm / 4, Math.min(performanceData.bpm * 4, value)));
  }

  function togglePlayback() {
    if (followsPerformance && !performanceAudio.ready) return;
    if (!isPlaying) {
      setToneStopToken(token => token + 1);
      setAudioBlocked(false);
      prepareAudioPlayback();
      // Start the selected output while this click still has user activation.
      if (followsPerformance) {
        if (!performanceAudio.playFromGesture()) return;
      } else if (soundEnabled) {
        // The cancellable playback effect reports failure. A stale click must
        // not stop a newer playback attempt after editing or quickly retrying.
        void unlockAudioContext();
      }
    }
    setIsPlaying((value) => !value);
  }

  function selectChord(index: number) {
    setActiveIndex(index);
    if (loopMode !== "full") setLoopStart(followsPerformance && loopMode === "pair" ? Math.min(index, Math.max(0, progression.length - 2)) : index);
    if (followsPerformance) performanceAudio.seekChord(index);
    else if (!isPlaying) void playChordSound(progression[index] ?? activeChord, activeTone, false, index);
  }

  function selectChartChord(chord: string) {
    const index = progression.findIndex((item) => item === chord);
    selectChord(index >= 0 ? index : 0);
  }

  function selectLoopMode(mode: LoopMode) {
    setLoopMode(mode);
    if (mode !== "full") setLoopStart(followsPerformance && mode === "pair" ? Math.min(activeIndex, Math.max(0, progression.length - 2)) : activeIndex);
  }

  function openEditor() {
    setDraftText(progressionText);
    setDraftPresetId(activePresetId);
    setDraftBpm(null);
    setDraftError(null);
    setIsPlaying(false);
    setPanel("edit");
  }

  function closePanel() {
    analysisRequestRef.current?.abort();
    analysisRequestRef.current = null;
    setAnalysisState((state) => state === "analyzing" ? "idle" : state);
    setPanel(null);
  }

  function applyDraft() {
    if (!parseProgression(draftText).length) {
      setDraftError({ message: "Add at least one chord to begin." });
      return;
    }
    const chords = parseProgression(draftText).map(canonicalChordLabel);
    const unsupported = [...new Set(chords.filter(chord => chord !== "N.C." && !normalizeMarkers(chord).length))];
    if (unsupported.length) {
      setDraftError({ message: "Voicings not available yet: {chords}. Choose a preset or try another chord.", values: { chords: unsupported.join(", ") } });
      return;
    }
    setProgressionText(chords.join("  "));
    setActivePresetId(draftPresetId);
    setImportedHarmony(null);
    if (chords.join("  ") !== progressionText) { setImportedTiming(null); setImportedChart(null); }
    playbackPositionRef.current.fraction = 0;
    if (draftBpm !== null) setBpm(draftBpm);
    setActiveIndex(0);
    setLoopStart(0);
    setIsPlaying(false);
    closePanel();
  }

  function useImportedChart(chart: ImportedChart) {
    const text = chart.steps.map(step => canonicalChordLabel(step.chord)).join("  ");
    setIsPlaying(false); setProgressionText(text); setActivePresetId(null);
    setImportedHarmony(null); setKeyChoice("auto");
    setImportedPerformance(null); setPerformanceMode("chords"); setPlayingMidis([]);
    setImportedChart({ progression: text, title: chart.title, steps: chart.steps, source: chart.source });
    setPinnedShapes({ progression: text, shapes: {} });
    setImportedTiming({ progression: text, beats: chart.steps.map(step => step.beats) });
    setBpm(chart.bpm); setLoopMode("full"); setActiveIndex(0); setLoopStart(0);
    playbackPositionRef.current.fraction = 0;
    closePanel();
  }

  function choosePreset(preset: ProgressionPreset) {
    setDraftText(preset.value);
    setDraftPresetId(preset.id);
    setDraftBpm(null);
    setDraftError(null);
    setPanel("edit");
  }

  function useRecognizedSong() {
    if (!analysisResult) return;
    setDraftText(analysisResult.progression);
    setDraftPresetId(null);
    setDraftBpm(analysisResult.bpm);
    setDraftError(null);
    setPanel("edit");
  }

  async function runRecognition() {
    if (!selectedSourceFile) {
      setAnalysisState("error");
      setAnalysisMessage("Choose an audio file first.");
      return;
    }
    analysisRequestRef.current?.abort();
    const request = new AbortController();
    analysisRequestRef.current = request;
    setAnalysisState("analyzing");
    setAnalysisResult(null);
    setAnalysisMessage("Listening for the chord progression…");
    try {
      const formData = new FormData();
      formData.append("audio", selectedSourceFile);
      const response = await fetch("/api/analyze-audio", { method: "POST", body: formData, signal: request.signal });
      const payload = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok || !payload.result) {
        setAnalysisState("error");
        setAnalysisMessage(payload.message ?? "Audio analysis is currently unavailable. You can still type your chords.");
        return;
      }
      setAnalysisResult(payload.result as AnalysisResult);
      setAnalysisState("ready");
      setAnalysisMessage("Review the detected chords before using them.");
    } catch {
      if (request.signal.aborted) return;
      setAnalysisState("error");
      setAnalysisMessage("Audio analysis could not finish. Your current progression is unchanged.");
    } finally {
      if (analysisRequestRef.current === request) analysisRequestRef.current = null;
    }
  }

  function exportChordChart() {
    if (!analysisResult || typeof window === "undefined") return;

    const chartText = [
      `${analysisResult.title}`,
      `${t(analysisResult.source)} · ${localize(analysisResult.key)} · ${analysisResult.bpm} BPM · ${Math.round(analysisResult.confidence * 100)}% ${t("confidence")}`,
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

  function isInsideLoop(index: number) {
    if (loopMode === "full") return true;
    if (loopMode === "hold") return index === activeIndex;
    return index === loopStart || index === loopEnd;
  }

  const panelTitles: Record<Panel, string> = {
    "chord-finder": "Find a chord", edit: "Edit progression", settings: "Practice settings", presets: "Choose a progression", import: "Import a source", "score-import": "Import an existing score", fingering: "Fingering & video reference",
    loop: "Loop & tempo", sound: "Sound", appearance: "Appearance", key: "Key signature", chart: "Song chart", guitar: "Dream guitar", harmony: "Harmony analysis"
  };
  const editorChild = panel === "presets" || panel === "import";
  const settingsChild = panel !== null && ["loop", "sound", "appearance", "key", "chart", "guitar"].includes(panel);
  const panelParent = editorChild ? "Edit progression" : settingsChild ? "Practice settings" : "FretFlow";
  const settingsRows: { panel: Panel; icon: IconName; label: string; value: string }[] = [
    { panel: "chord-finder", icon: "key", label: "Find a chord", value: t("Choose fretboard positions") },
    { panel: "loop", icon: "loop", label: "Loop & tempo", value: `${t(loopMode === "full" ? "Full progression" : loopMode === "pair" ? "A/B pair" : "Hold chord")} · ${bpm} BPM` },
    { panel: "sound", icon: soundEnabled ? "sound" : "muted", label: "Sound", value: t(soundEnabled ? playbackLabel : "Muted") },
    { panel: "appearance", icon: "appearance", label: "Appearance", value: `${t(activePalette.name)} · ${t(isFocused ? "Fretboard" : "Full guitar")}` },
    { panel: "key", icon: "key", label: "Key signature", value: `${keyChoice === "auto" ? t("Auto") + " · " : ""}${effectiveKey}` }
  ];
  if (analysisResult) settingsRows.push({ panel: "chart", icon: "library", label: "Song chart", value: analysisResult.title });

  return <main className={`practice-workspace ${focusMode ? "practice-focus-mode" : ""}`} style={workspaceStyle}
    onClickCapture={() => { if (soundEnabled && !followsPerformance) void unlockAudioContext(); }}>
    <header className="practice-header">
      <a className="practice-brand" href="/" aria-label={t("FretFlow home")}><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>FretFlow<span className="brand-section">{t("Practice")}</span></a>
      <span className="transcribe-header-note"><TestFeedback compact /></span>
      <button className="transcribe-entry" aria-label={t("Video / audio")} onClick={() => { setIsPlaying(false); setPanel(null); setTranscriptionOpen(true); }}><WorkspaceIcon name="import" size={18} /><span className="transcribe-label">{t("Video to chords")}</span><span className="transcribe-label-mobile">{t("Import")}</span></button>
      <LanguageSwitcher />
      <button className="quiet-button" aria-label={t("Settings")} onClick={() => setPanel("settings")}><WorkspaceIcon name="settings" size={18} /><span>{t("Settings")}</span></button>
    </header>

    <GuitarStage focusMode={focusMode} onFocusModeChange={setFocusMode} preferredRange={fretRange} guitar={activeGuitar} noteMode={followsNotes} tuning={performanceData?.tuning} markers={followsNotes ? playedPositions : markers} chord={followsNotes ? t("Sounding notes") : activeChord} degree={followsNotes ? playingMidis.map(midiName).join(" · ") || t("Rest") : activeDegree} focused={isFocused} isPlaying={isPlaying} chordDurationMs={chordDurationMs} onFocus={() => setIsFocused(true)} />
    {showDiagram && !followsNotes ? <div className="practice-diagram"><ChordDiagram chord={activeChord} degree={activeDegree} markers={markers} /></div> : null}

    <section className="practice-dock" aria-label={t("Practice controls")}>
      {audioBlocked || (followsPerformance && performanceAudio.error) ? <p className="practice-audio-error" role="status">{t("Audio could not start. Tap Play to retry.")}</p> : null}
      <div className="practice-dock-heading">
        <div><span className="eyebrow">{t("Your progression")}</span>{loopMode !== "full" ? <span className="active-loop-label">{loopMode === "pair" ? t("A/B loop") : t("Holding chord")}</span> : null}</div>
        <div className="practice-dock-actions"><button className="quiet-button" onClick={() => { setIsPlaying(false); setPanel("score-import"); }}><WorkspaceIcon name="import" size={15} />{t("Import score")}</button><button className="quiet-button harmony-shortcut" aria-label={t("Harmony analysis")} onClick={() => { setIsPlaying(false); setPanel("harmony"); }}><WorkspaceIcon name="key" size={15} />{t("Harmony")}</button><button className="quiet-button edit-progression" onClick={openEditor}><WorkspaceIcon name="edit" size={15} />{t("Edit")}</button></div>
      </div>
      {performanceData ? <div className="practice-audio-bar">
        <div className="practice-audio-modes" role="group" aria-label={t("Practice audio")}>
          {performanceData.notes.length ? <button type="button" aria-pressed={performanceMode === "notes"} onClick={() => switchPlaybackMode("notes")}>{t("Synthesized")}</button> : null}
          {performanceData.originalUrl ? <button type="button" aria-pressed={performanceMode === "original"} onClick={() => switchPlaybackMode("original")}>{t("Original")}</button> : null}
        </div>
        <div className="practice-playing-notes" aria-label={t("Sounding notes")}>
          {followsNotes ? <><span>{t("Notes")}</span>{playingMidis.length ? playingMidis.map(midi => <strong key={midi} data-midi={midi}>{midiName(midi)}</strong>) : <span>{t("Rest")}</span>}</> : <span>{t(followsOriginal ? "Play with the original recording" : "Suggested chord practice")}</span>}
        </div>
      </div> : null}
      <div className="practice-fingering-bar"><button className="quiet-button" onClick={() => { setIsPlaying(false); setPanel("chord-finder"); }}>{t("Find a chord")}</button><button className="quiet-button" onClick={() => { setIsPlaying(false); setPanel("fingering"); }}>{t("Fingering & video")} · {t("Frets {min}–{max}", fretRange)}</button><small>{t(chartSteps?.[activeIndex]?.sourceShape && !(pinnedShapes.progression === progressionText && pinnedShapes.shapes[activeIndex]) ? "Written in source score" : pinnedShapes.progression === progressionText && pinnedShapes.shapes[activeIndex] ? "Your chosen shape" : "Connected suggestions")}</small></div>
      {importedChart?.progression === progressionText && <p className="imported-score-caption">{importedChart.source !== "manual" && <>{t("From your chart")} · </>}{importedChart.title === "Imported chord chart" || importedChart.title === "Your progression" ? t(importedChart.title) : importedChart.title} · {t("Suggested practice voicings")}</p>}
      <div className="practice-chords" ref={chordStripRef} aria-label={t("Chord progression")}>
        {progression.map((chord, index) => <button key={`${chord}-${index}`} className={`${activeIndex === index ? "active" : ""} ${isInsideLoop(index) ? "in-loop" : "outside-loop"}`}
          ref={activeIndex === index ? activeChordRef : null}
          aria-label={`${chord} ${degrees[index]}`} aria-pressed={activeIndex === index} onClick={() => selectChord(index)}>
          <ChordThumbnail chord={chord} markers={connectedShapes[index] ?? []} />
          <span>{chord}</span><small>{degrees[index]}{importedChart?.progression === progressionText ? ` · ${t("{count} beats", { count: Number((importedTiming?.beats[index] ?? 4).toFixed(2)) })}` : ""}</small>
        </button>)}
      </div>
      <div className="practice-transport">
        <button className="tempo-shortcut" onClick={() => setPanel("loop")} aria-label={t("Adjust tempo, {bpm} BPM", { bpm })}><span className={isPlaying ? "beat-dot playing" : "beat-dot"} style={{ animationDuration: `${60000 / bpm}ms` }} /><strong>{bpm}</strong><span>BPM</span></button>
        <div className="transport-center">
          <button className="icon-button" aria-label={t("Previous chord")} title={t("Previous chord")} onClick={() => step(-1)}><WorkspaceIcon name="previous" size={19} /></button>
          <button className="play-button" disabled={followsPerformance && !performanceAudio.ready} onClick={togglePlayback} aria-label={isPlaying ? t("Pause playback") : t("Play progression")}><WorkspaceIcon name={isPlaying ? "pause" : "play"} size={19} /><span>{isPlaying ? t("Pause") : t("Play")}</span></button>
          <button className="icon-button" aria-label={t("Next chord")} title={t("Next chord")} onClick={() => step(1)}><WorkspaceIcon name="next" size={19} /></button>
        </div>
        <span className="practice-position" aria-label={t("Chord {index} of {total}", { index: activeIndex + 1, total: progression.length })}>{String(activeIndex + 1).padStart(2, "0")}<span>/</span>{String(progression.length).padStart(2, "0")}</span>
      </div>
    </section>
    <footer className="practice-footer"><span>{t(soundEnabled ? playbackLabel : "Sound off")}</span><i /><span>{t("Key {key}", { key: localize(displayedKey) })}</span>{followsPerformance ? <><i /><span>{t(performanceAudio.error ? followsOriginal ? "Original recording is unavailable. Reopen the source or choose another playback mode." : "Detected timing playback is unavailable." : performanceAudio.ready ? followsOriginal ? "Play along · suggested chord shapes" : "Synthesized notes · suggested positions · Beta" : followsOriginal ? "Loading original recording…" : "Loading score sounds…")}</span></> : null}<i /><TestFeedback compact /></footer>

    <WorkspaceSheet view={panel} title={panel ? panelTitles[panel] : ""} section={panelParent} onClose={closePanel}
      onBack={editorChild || settingsChild ? () => {
        if (panel === "import") { analysisRequestRef.current?.abort(); setAnalysisState(state => state === "analyzing" ? "idle" : state); }
        setPanel(editorChild ? "edit" : "settings");
      } : undefined}>
      {panel === "edit" ? <form className="progression-editor" onSubmit={event => { event.preventDefault(); applyDraft(); }}>
        <label className="field-label" htmlFor="progression-draft">{t("Chords")}</label>
        <textarea id="progression-draft" aria-describedby={draftError ? "draft-error" : "draft-hint"} aria-invalid={Boolean(draftError)} value={draftText}
          onChange={event => { setDraftText(event.target.value); setDraftPresetId(null); setDraftError(null); }} spellCheck={false} />
        <p id="draft-hint" className="field-hint">{t("Separate chords with spaces. Changes apply when you’re ready.")}</p>
        {draftError ? <p id="draft-error" role="alert" className="field-error">{t(draftError.message, draftError.values)}</p> : null}
        <div className="editor-options">
          <button type="button" className="secondary-button" onClick={() => setPanel("presets")}><WorkspaceIcon name="library" size={17} />{t("Browse presets")}</button>
          <button type="button" className="secondary-button" onClick={() => setPanel("import")}><WorkspaceIcon name="import" size={17} />{t("Import")}</button>
        </div>
        <div className="sheet-actions"><button type="button" className="quiet-button" onClick={closePanel}>{t("Cancel")}</button><button className="action-button" type="submit">{t("Use progression")}<WorkspaceIcon name="check" size={17} /></button></div>
      </form> : null}

      {panel === "harmony" ? <div className="harmony-detail">
        <div className="harmony-key"><span className="eyebrow">{importedHarmony?.progression === progressionText ? t("Imported analysis") : keyChoice === "auto" ? t("Suggested key") : t("Selected key")}</span><strong>{localize(displayedKey)}</strong><select className="harmony-key-select" aria-label={t("Analysis key reference")} value={keyChoice} onChange={event => { setImportedHarmony(null); setKeyChoice(event.target.value as "auto" | KeyName); }}><option value="auto">{t("Auto")}</option>{KEYS.map(key => <option key={key} value={key}>{key} {t("major")}</option>)}</select></div>
        <p className="field-hint">{t("Follow the chord degrees across your progression. The small diagrams show finger numbers; the large fretboard shows intervals.")}</p>
        <div className="harmony-chords">{progression.map((chord, index) => <button key={`${chord}-${index}`} aria-pressed={activeIndex === index} onClick={() => selectChord(index)}><strong>{chord}</strong><span className="harmony-degree">{degrees[index]}</span><small>{t("Voicing")} · {(connectedShapes[index] ?? []).map(marker => marker.interval).join(" · ")}</small></button>)}</div>
        <p className="field-hint">{importedHarmony?.progression === progressionText ? t("Key and chord degrees come from your imported analysis.") : t("Auto suggests a major-key reference. Change the key if your song resolves elsewhere.")}</p>
        <button className="secondary-button" onClick={() => { closePanel(); setIsPlaying(false); setTranscriptionOpen(true); }}><WorkspaceIcon name="import" size={17} />{t("Analyze video / audio")}</button>
      </div> : null}

      {panel === "settings" ? <div className="settings-list"><button className="dream-guitar-entry" onClick={() => setPanel("guitar")}><img src={activeGuitar.image} alt="" /><span><small>{t("Dream guitar")}</small><strong>{activeGuitar.family === "Original" ? activeGuitar.model : activeGuitar.family}</strong><span>{activeGuitar.finish}</span></span><WorkspaceIcon name="chevron" size={17} /></button>{settingsRows.map(row => <button key={row.panel} className="settings-row" onClick={() => setPanel(row.panel)}>
        <span className="settings-row-icon"><WorkspaceIcon name={row.icon} /></span><span><strong>{t(row.label)}</strong><small>{row.value}</small></span><WorkspaceIcon name="chevron" size={16} />
      </button>)}<TestFeedback /></div> : null}

      {panel === "presets" ? <div className="preset-cards">{progressionPresets.map(preset => <button key={preset.id} onClick={() => choosePreset(preset)}>
        <span className="eyebrow">{t(preset.style)}</span><strong>{t(preset.name)}</strong><span className="preset-chords">{preset.value}</span><WorkspaceIcon name="chevron" size={16} />
      </button>)}</div> : null}

      {panel === "loop" ? <div className="settings-detail">
        <div className="tempo-setting"><label htmlFor="practice-tempo">{t("Tempo")}</label><output htmlFor="practice-tempo">{bpm}<small>BPM</small></output><input id="practice-tempo" aria-label={t("Playback tempo")} type="range" min={followsOriginal && performanceData ? Math.max(30, performanceData.bpm / 4) : 30} max={followsOriginal && performanceData ? Math.min(240, performanceData.bpm * 4) : 240} step="0.1" value={bpm} onChange={event => setBpm(Number(event.target.value))} /><div><span>30</span><span>240</span></div></div>
        <fieldset className="option-list"><legend>{t("Loop")}</legend>{([
          ["full", "Full progression", "Move through every chord."], ["pair", "A/B pair", "Repeat the current chord and the next one."], ["hold", "Hold chord", "Stay on one shape while you practice."]
        ] as const).map(([mode, name, description]) => <label key={mode}><input type="radio" name="loop" checked={loopMode === mode} onChange={() => selectLoopMode(mode)} /><span><strong>{t(name)}</strong><small>{t(description)}</small></span></label>)}</fieldset>
        {loopMode !== "full" ? <p className="setting-note">{loopMode === "pair" ? `${progression[loopStart]} ↔ ${progression[loopEnd]}` : activeChord}</p> : null}
      </div> : null}

      {panel === "sound" ? <div className="settings-detail">
        <details className="tone-guide-details"><summary>{t("Tone starting points")}</summary><ToneGuide stopToken={toneStopToken} onBeforePlay={() => { setIsPlaying(false); noteAudio.pauseNow(); originalAudio.pauseNow(); for (const voice of chordVoicesRef.current) { try { voice.stop(); } catch { /* Already ended. */ } } chordVoicesRef.current.clear(); }} /></details>
        {performanceData ? <fieldset className="option-list"><legend>{t("Playback")}</legend>{([["original", "Original recording", "Play along with the source. Slow it down or loop a phrase."], ["notes", "Synthesized · Beta", "Hear the detected notes with our guitar sound."], ["chords", "Chord practice", "Explore suggested shapes with your own sound."]] as const).filter(([mode]) => mode === "chords" || (mode === "notes" ? performanceData.notes.length : performanceData.originalUrl)).map(([mode, name, description]) => <label key={name}><input type="radio" name="performance-mode" checked={performanceMode === mode} onChange={() => switchPlaybackMode(mode)} /><span><strong>{t(name)}</strong><small>{t(description)}</small></span></label>)}</fieldset> : null}
        <label className="toggle-row"><span><strong>{t("Guitar sound")}</strong><small>{t("Hear the chords as they move.")}</small></span><input type="checkbox" role="switch" checked={soundEnabled} onChange={event => { setSoundEnabled(event.target.checked); if (event.target.checked && !followsPerformance && !isPlaying) void playChordSound(activeChord, activeTone, true); }} /></label>
        <fieldset className="option-list" disabled={followsPerformance}><legend>{t("Tone")}</legend>{tonePresets.map(tone => <label key={tone.id}><input type="radio" name="tone" checked={toneId === tone.id} onChange={() => { setToneId(tone.id); if (soundEnabled) void playChordSound(activeChord, tone); }} /><span><strong>{t(tone.name)}</strong></span></label>)}</fieldset>
      </div> : null}

      {panel === "appearance" ? <div className="settings-detail">

        <fieldset className="option-list palette-options"><legend>{t("Note colors")}</legend>{markerPalettes.map(palette => <label key={palette.id}><input type="radio" name="palette" checked={paletteId === palette.id} onChange={() => setPaletteId(palette.id)} /><span><strong>{t(palette.name)}</strong></span><span className="palette-swatches" aria-hidden="true">{[palette.root, palette.third, palette.fifth, palette.seventh, palette.extension].map((color, i) => <i key={i} style={{ background: color }} />)}</span></label>)}</fieldset>
        <label className="toggle-row"><span><strong>{t("Focus on fretboard")}</strong><small>{t("A closer view of each chord shape.")}</small></span><input type="checkbox" role="switch" checked={isFocused} onChange={event => setIsFocused(event.target.checked)} /></label>
        <label className="toggle-row"><span><strong>{t("Fingering diagram")}</strong><small>{t("Show a small chord chart beside the guitar.")}</small></span><input type="checkbox" role="switch" checked={showDiagram} onChange={event => setShowDiagram(event.target.checked)} /></label>
      </div> : null}

      {panel === "guitar" ? <div className="dream-guitar-picker">
        <p className="field-hint">{t("The guitar you want to pick up every day.")}</p>
        <div className="guitar-filters" role="group" aria-label={t("Guitar family")}>{["All", "Stratocaster", "Telecaster", "Jazzmaster"].map(family => <button key={family} aria-pressed={guitarFamily === family} onClick={() => setGuitarFamily(family)}>{family === "Stratocaster" ? "Strat" : family === "Telecaster" ? "Tele" : t(family)}</button>)}</div>
        <div className="guitar-gallery">{dreamGuitars.filter(guitar => guitarFamily === "All" || guitar.family === guitarFamily).map(guitar => <article key={guitar.id} className={guitarId === guitar.id ? "selected" : ""}>
          <button className="guitar-choice" aria-pressed={guitarId === guitar.id} onClick={() => chooseGuitar(guitar.id)} aria-label={t("Choose {model}, {finish}", { model: guitar.model, finish: guitar.finish })}>
            <span className="guitar-preview"><img src={guitar.image} alt="" loading="lazy" /></span>
            <span className="guitar-choice-title"><strong>{guitar.family === "Original" ? guitar.model : guitar.family}</strong><span>{guitarId === guitar.id ? <WorkspaceIcon name="check" size={17} /> : null}</span></span><span className="guitar-finish">{guitar.finish}</span>
          </button>
          {guitar.source ? <a href={guitar.source} target="_blank" rel="noreferrer">{t("View on Fender ↗")}</a> : <span className="original-guitar-label">{t("Your original guitar")}</span>}
        </article>)}</div>
        <div className="sheet-actions"><button className="action-button" onClick={closePanel}>{t("Back to practice")}<WorkspaceIcon name="check" size={17} /></button></div>
      </div> : null}

      {panel === "key" ? <div className="settings-detail"><label className="field-label" htmlFor="practice-key">{t("Progression key")}</label><select className="key-select" id="practice-key" value={keyChoice} onChange={event => { setImportedHarmony(null); setKeyChoice(event.target.value as "auto" | KeyName); }}><option value="auto">{t("Auto detect · {key}", { key: effectiveKey })}</option>{KEYS.map(key => <option key={key} value={key}>{key}</option>)}</select><p className="field-hint">{t("The Roman numerals show each chord’s role in this key.")}</p></div> : null}

      {panel === "fingering" ? <FingeringPanel chords={progression} index={Math.max(0, activeIndex)} onIndex={index => { setIsPlaying(false); setActiveIndex(index); playbackPositionRef.current.fraction = 0; if (followsPerformance) performanceAudio.seekChord(index); }} range={fretRange} onRange={chooseFretRange} candidates={choicesByChord.get(activeChord) ?? []} selected={markers}
        onChoose={shape => setPinnedShapes(previous => ({ progression: progressionText, shapes: { ...(previous.progression === progressionText ? previous.shapes : {}), [activeIndex]: shape } }))}
        pinned={Boolean(pinnedShapes.progression === progressionText && pinnedShapes.shapes[activeIndex])}
        onReset={() => setPinnedShapes(previous => { const shapes = { ...previous.shapes }; delete shapes[activeIndex]; return { ...previous, shapes }; })}
        sourceShape={chartSteps?.[activeIndex]?.sourceShape} videoFile={referenceVideo} onVideo={setReferenceVideo} chordTime={chordReferenceTime} /> : null}
      {panel === "chord-finder" ? <ChordFinder shape={finderShape} onChange={setFinderShape}
        onPreview={shape => { void playChordSound("", activeTone, true, activeIndex, undefined, shape); }}
        onAdd={(chord, shape) => {
          // Carry existing durations and chosen shapes into the extended chart.
          // Appending ends the recording-linked transport, whose timeline has no new step.
          const steps = progression.map((chord, index) => ({ chord, beats: importedTiming?.progression === progressionText ? importedTiming.beats[index] ?? 2 : 2,
            section: chartSteps?.[index]?.section ?? "", sourceShape: chartSteps?.[index]?.sourceShape }));
          steps.push({ chord, beats: 4, section: "", sourceShape: undefined });
          useImportedChart({ title: importedChart?.progression === progressionText ? importedChart.title : "Your progression", steps, bpm, source: "manual", notices: [] });
          setKeyChoice(keyChoice);
          setPinnedShapes({ progression: steps.map(step => canonicalChordLabel(step.chord)).join("  "),
            shapes: Object.fromEntries([...connectedShapes, shape].map((markers, index) => [index, markers])) });
          setActiveIndex(steps.length - 1);
        }} /> : null}
      {panel === "score-import" ? <ScoreImport bpm={bpm} markersFor={chord => voicingCandidates(chord, fretRange, voicings[chord] ?? [])[0] ?? []} onUse={useImportedChart} /> : null}
      {panel === "import" ? <div className="settings-detail">
        <button className="action-button full-width" onClick={() => setPanel("score-import")}>{t("Import an existing score")}<WorkspaceIcon name="import" size={16} /></button>
        <div className="import-tabs" role="group" aria-label={t("Import source")}><button aria-pressed={inputMode === "audio"} onClick={() => setInputMode("audio")}>{t("Audio")}</button><button aria-pressed={inputMode === "chart"} onClick={() => { analysisRequestRef.current?.abort(); setAnalysisState(state => state === "analyzing" ? "idle" : state); setInputMode("chart"); }}>{t("Screenshot")}</button></div>
        {inputMode === "chart" ? <div className="import-unavailable"><WorkspaceIcon name="import" size={26} /><strong>{t("Screenshot recognition isn’t connected yet.")}</strong><p>{t("You can enter the chords in the editor, or choose a preset to start practicing.")}</p><button className="secondary-button" onClick={() => setPanel("edit")}>{t("Enter chords")}</button></div> : <>
          <p className="field-hint">{t("Import a favorite clip for a chord chart and playing suggestions. Staff notation and tabs are optional Beta drafts.")}</p>
          <button className="action-button full-width" onClick={() => { closePanel(); setIsPlaying(false); setTranscriptionOpen(true); }}>{t("Import video / audio")}<WorkspaceIcon name="import" size={16} /></button>
        </>}
      </div> : null}

      {panel === "chart" && analysisResult ? <div className="imported-chart"><p className="field-hint">{analysisResult.title} · {analysisResult.key} · {analysisResult.bpm} BPM</p>{analysisResult.sections.map(section => <section key={section.name}><h3>{section.name}</h3><div>{section.bars.map((bar, index) => <button key={index} onClick={() => { selectChartChord(bar[0]); closePanel(); }}><small>{index + 1}</small>{bar.join("  ")}</button>)}</div></section>)}<button className="secondary-button" onClick={exportChordChart}><WorkspaceIcon name="import" size={16} />{t("Export chart")}</button></div> : null}
    </WorkspaceSheet>
    <MediaTranscription open={transcriptionOpen} onClose={() => setTranscriptionOpen(false)} onPractice={result => {
      const chords = result.chords.filter(chord => chord.root !== null && chord.end > result.score_settings.offset);
      if (!chords.length) return;
      const text = chords.map(chord => canonicalChordLabel(chord.label)).join("  ");
      setProgressionText(text); setActivePresetId(null);
      setImportedChart(null);
      setImportedPerformance({ progression: text, data: practicePerformance(result) });
      chooseFretRange({ min: result.score_settings.fret_min ?? 5, max: result.score_settings.fret_max ?? 12 });
      setPerformanceMode(result.notes.some(note => !note.excluded) ? "notes" : "original");
      setPlayingMidis([]);
      setImportedHarmony({ progression: text, key: result.key.label, degrees: chords.map(chord => chord.roman) });
      setImportedTiming({ progression: text, beats: chords.map((chord, index) => {
        // Keep gaps before the next detected chord so later changes stay on time.
        const start = Math.max(chord.start, result.score_settings.offset);
        const end = chords[index + 1]?.start ?? chord.end;
        return Math.max(0.01, end - start) * result.score_settings.bpm / 60;
      }) });
      setBpm(result.score_settings.bpm);
      setLoopMode("full");
      playbackPositionRef.current.fraction = 0;
      setActiveIndex(0); setLoopStart(0); setIsPlaying(false); setPanel(null); setTranscriptionOpen(false);
    }} />
  </main>;
}
