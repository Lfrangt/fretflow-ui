"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Act } from "@/components/three/guitar-scene";
import { GuitarScene } from "@/components/three/guitar-scene";
import { strumChord, unlockAudio } from "@/lib/audio";
import {
  chordMarkers,
  defaultProgression,
  markerKind,
  parseProgression,
  progressionPresets
} from "@/lib/chords";
import { defaultFinish, finishes, markerColors } from "@/lib/finishes";

const CUSTOM_ID = "custom";

const fade = {
  initial: { opacity: 0, y: 18, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -14, filter: "blur(6px)" },
  transition: { duration: 0.55, ease: [0.32, 0.72, 0, 1] as const }
};

export function FretflowApp() {
  const [act, setAct] = useState<Act>("intro");
  const [finishId, setFinishId] = useState(defaultFinish.id);
  const [presetId, setPresetId] = useState(defaultProgression.id);
  const [customText, setCustomText] = useState("Am7  D9  Gmaj7  Cmaj7");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(72);
  const [soundOn, setSoundOn] = useState(true);
  const autoplayTimer = useRef<number | null>(null);

  const finish = finishes.find((item) => item.id === finishId) ?? defaultFinish;
  const preset = progressionPresets.find((item) => item.id === presetId);
  const progression = useMemo(
    () => (presetId === CUSTOM_ID ? parseProgression(customText) : (preset ?? defaultProgression).chords),
    [presetId, customText, preset]
  );
  const activeChord = progression[activeIndex] ?? progression[0];
  const markers = useMemo(() => chordMarkers(activeChord), [activeChord]);

  const playChord = useCallback(
    (chord: string) => {
      if (soundOn) void strumChord(chord);
    },
    [soundOn]
  );

  // Transport clock: each chord holds for two beats.
  useEffect(() => {
    if (!isPlaying || act !== "stage") return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % progression.length);
    }, (60000 / bpm) * 2);
    return () => window.clearInterval(interval);
  }, [isPlaying, act, bpm, progression.length]);

  useEffect(() => {
    if (act === "stage" && isPlaying) playChord(activeChord);
  }, [activeChord, act, isPlaying, playChord]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, progression.length - 1));
  }, [progression.length]);

  useEffect(() => {
    return () => {
      if (autoplayTimer.current) window.clearTimeout(autoplayTimer.current);
    };
  }, []);

  const enterStage = useCallback(() => {
    void unlockAudio();
    setActiveIndex(0);
    setAct("stage");
    // Let the camera land on the fretboard before the first strum.
    if (autoplayTimer.current) window.clearTimeout(autoplayTimer.current);
    autoplayTimer.current = window.setTimeout(() => setIsPlaying(true), 1100);
  }, []);

  const leaveStage = useCallback(() => {
    setIsPlaying(false);
    if (autoplayTimer.current) window.clearTimeout(autoplayTimer.current);
    setAct("customize");
  }, []);

  const step = useCallback(
    (direction: number) => {
      setActiveIndex((current) => {
        const next = (current + direction + progression.length) % progression.length;
        playChord(progression[next]);
        return next;
      });
    },
    [progression, playChord]
  );

  const togglePlay = useCallback(() => {
    setIsPlaying((value) => {
      if (!value) playChord(activeChord);
      return !value;
    });
  }, [activeChord, playChord]);

  useEffect(() => {
    if (act !== "stage") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowRight") {
        step(1);
      } else if (event.key === "ArrowLeft") {
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, togglePlay, step]);

  return (
    <main className={`shell act-${act}`} onPointerDown={() => void unlockAudio()}>
      <div className="glow" aria-hidden />
      <GuitarScene act={act} finish={finish} markers={markers} pulseId={activeIndex} />

      <header className="masthead">
        <span className="wordmark">FretFlow</span>
        <nav className="steps" aria-label="Progress">
          {(["intro", "customize", "stage"] as Act[]).map((step_) => (
            <i key={step_} className={act === step_ ? "on" : ""} />
          ))}
        </nav>
      </header>

      <AnimatePresence mode="wait">
        {act === "intro" && (
          <motion.section key="intro" className="intro" {...fade}>
            <p className="eyebrow">Fretboard choreography</p>
            <h1>
              Chord motion,
              <br />
              on the instrument.
            </h1>
            <p className="lede">
              Advanced voicings — jazz, neo-soul, R&amp;B — animated across a real fretboard, one
              hand-shape at a time.
            </p>
            <button className="cta" onClick={() => setAct("customize")}>
              Design your guitar
            </button>
          </motion.section>
        )}

        {act === "customize" && (
          <motion.section key="customize" className="customize" {...fade}>
            <div className="panel">
              <header>
                <p className="eyebrow">Studio</p>
                <h2>Make it yours.</h2>
              </header>

              <div className="field">
                <label>Finish</label>
                <div className="swatches" role="radiogroup" aria-label="Guitar finish">
                  {finishes.map((item) => (
                    <button
                      key={item.id}
                      role="radio"
                      aria-checked={item.id === finishId}
                      className={`swatch ${item.id === finishId ? "on" : ""}`}
                      onClick={() => setFinishId(item.id)}
                    >
                      <span style={{ background: item.body }} />
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Progression</label>
                <div className="presets" role="radiogroup" aria-label="Chord progression">
                  {progressionPresets.map((item) => (
                    <button
                      key={item.id}
                      role="radio"
                      aria-checked={item.id === presetId}
                      className={`preset ${item.id === presetId ? "on" : ""}`}
                      onClick={() => {
                        setPresetId(item.id);
                        setActiveIndex(0);
                      }}
                    >
                      <span className="preset-name">
                        {item.name}
                        <small>{item.style}</small>
                      </span>
                      <span className="preset-chords">{item.chords.join(" · ")}</span>
                    </button>
                  ))}
                  <button
                    role="radio"
                    aria-checked={presetId === CUSTOM_ID}
                    className={`preset ${presetId === CUSTOM_ID ? "on" : ""}`}
                    onClick={() => setPresetId(CUSTOM_ID)}
                  >
                    <span className="preset-name">
                      Custom
                      <small>Type your own</small>
                    </span>
                    {presetId === CUSTOM_ID ? (
                      <input
                        value={customText}
                        autoFocus
                        spellCheck={false}
                        aria-label="Custom chord progression"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          setCustomText(event.target.value);
                          setActiveIndex(0);
                        }}
                      />
                    ) : (
                      <span className="preset-chords">{parseProgression(customText).join(" · ")}</span>
                    )}
                  </button>
                </div>
              </div>

              <footer>
                <button className="ghost" onClick={() => setAct("intro")}>
                  Back
                </button>
                <button className="cta" onClick={enterStage}>
                  Build the fretboard
                </button>
              </footer>
            </div>
          </motion.section>
        )}

        {act === "stage" && (
          <motion.section key="stage" className="stage" {...fade}>
            <button className="ghost back" onClick={leaveStage}>
              ← Studio
            </button>

            <div className="now-playing">
              <AnimatePresence mode="popLayout">
                <motion.h2
                  key={activeChord + activeIndex}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                >
                  {activeChord}
                </motion.h2>
              </AnimatePresence>
              <div className="chips" role="tablist" aria-label="Progression">
                {progression.map((chord, index) => (
                  <button
                    key={`${chord}-${index}`}
                    role="tab"
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? "on" : ""}
                    onClick={() => {
                      setActiveIndex(index);
                      playChord(chord);
                    }}
                  >
                    {chord}
                  </button>
                ))}
              </div>
            </div>

            <div className="legend" aria-label="Interval colors">
              {(
                [
                  ["R", "root"],
                  ["3", "third"],
                  ["5", "fifth"],
                  ["7", "seventh"],
                  ["ext", "extension"]
                ] as const
              ).map(([label, kind]) => (
                <span key={kind}>
                  <i style={{ background: markerColors[kind] }} />
                  {label}
                </span>
              ))}
            </div>

            <div className="dock">
              <button className="icon" onClick={() => step(-1)} aria-label="Previous chord">
                ‹
              </button>
              <button className="play" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? "❚❚" : "▶"}
              </button>
              <button className="icon" onClick={() => step(1)} aria-label="Next chord">
                ›
              </button>
              <span className="divider" />
              <label className="tempo">
                <span className="mono">{bpm} BPM</span>
                <input
                  type="range"
                  min={48}
                  max={132}
                  value={bpm}
                  aria-label="Tempo"
                  onChange={(event) => setBpm(Number(event.target.value))}
                />
              </label>
              <span className="divider" />
              <button
                className={`icon sound ${soundOn ? "on" : ""}`}
                aria-label={soundOn ? "Mute" : "Unmute"}
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  if (next) void strumChord(activeChord);
                }}
              >
                {soundOn ? "♪" : "∅"}
              </button>
            </div>

            <div className="legend-markers" aria-hidden>
              {markers.map((marker, index) => (
                <span key={index} className="sr-only">
                  {`String ${marker.string}, fret ${marker.fret}, ${markerKind(marker.interval)}`}
                </span>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
