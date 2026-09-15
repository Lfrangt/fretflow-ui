"use client";

import { useLanguage } from "./language-provider";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useEffect, useRef, useState } from "react";
import type { DreamGuitar } from "@/lib/dream-guitars";
import { guitarLayout, mobileFocusLayout } from "@/lib/guitar-layout";
import { WorkspaceIcon } from "./workspace-icon";

type Marker = { string: number; fret: number; interval: string; finger: number; midi?: number };
const strings = ["E", "A", "D", "G", "B", "e"];
const colorClass = (interval: string) => interval === "R" ? "root" : ["3", "b3"].includes(interval) ? "third" : ["5", "b5", "#5"].includes(interval) ? "fifth" : interval.includes("7") ? "seventh" : "extension";
const stringY = (string: number) => 10 + (6 - string) * 16;
const focusEase = [.22, 1, .36, 1] as const;
const glideEase = [.25, .8, .25, 1] as const;

export function GuitarStage({ markers, chord, degree, focused, focusMode, onFocusModeChange, isPlaying, chordDurationMs, onFocus, guitar, noteMode = false, tuning = "standard", preferredRange = { min: 1, max: 12 } }: {
  focusMode: boolean; onFocusModeChange: (value: boolean) => void;
  preferredRange?: { min: number; max: number }; noteMode?: boolean; tuning?: "standard" | "drop-d"; guitar: DreamGuitar; markers: Marker[]; chord: string; degree: string; focused: boolean; isPlaying: boolean; chordDurationMs: number; onFocus: () => void;
}) {
  const { t } = useLanguage();
  const contourId = useId().replaceAll(":", "");
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const focusButtonRef = useRef<HTMLButtonElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const [phoneLandscape, setPhoneLandscape] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(orientation: landscape) and (max-height: 500px) and (max-width: 1000px)");
    const update = () => setPhoneLandscape(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!focusMode) return;
    function exitFocus(event: KeyboardEvent) {
      // A sheet owns Escape while it is open; returning to the stage stays focused.
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('dialog[open], [aria-modal="true"]')) return;
      onFocusModeChange(false);
      focusButtonRef.current?.focus();
    }
    window.addEventListener("keydown", exitFocus);
    return () => window.removeEventListener("keydown", exitFocus);
  }, [focusMode, onFocusModeChange]);
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSpace(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Sounding notes can span bass and upper positions within one phrase. Keep the
  // grid still as notes enter and leave, so their positions remain readable.
  const lastFret = noteMode ? 21 : Math.max(12, preferredRange.max, ...markers.map(m => m.fret));
  const firstFret = noteMode ? 1 : Math.max(1, Math.min(preferredRange.min, ...markers.map(m => m.fret), lastFret - 11));
  const visibleFrets = lastFret - firstFret + 1;
  const compact = space.width < 640;
  // Both phone orientations use the neck-only practice view, including outside Focus.
  const mobileFocus = (focusMode && space.width < 900) || ((compact || phoneLandscape) && focused);
  const layout = mobileFocus ? mobileFocusLayout(guitar, space.width, space.height - (phoneLandscape ? 44 : 94), visibleFrets) : guitarLayout(guitar, focused, compact, focusMode);
  const showNeck = focused || focusMode;
  const scale = mobileFocus ? 1 : Math.max(0, Math.min((space.width - 16) / layout.width, (space.height - (showNeck ? 20 : 64)) / layout.height, 1.15));
  const markerFrets = markers.map(marker => marker.fret).join(",");
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!mobileFocus) { viewport.scrollLeft = 0; return; }
    const frets = markerFrets ? markerFrets.split(",").map(Number) : [];
    if (!frets.length) return;
    // Reframe chord changes, but keep a note phrase still while it remains visible.
    const fretWidth = (layout.neckWidth - 14) / visibleFrets;
    const left = layout.neckX + 14 + (Math.max(firstFret, Math.min(...frets)) - firstFret) * fretWidth;
    const right = layout.neckX + 14 + (Math.max(...frets) - firstFret + 1) * fretWidth;
    if (noteMode && left >= viewport.scrollLeft + 20 && right <= viewport.scrollLeft + viewport.clientWidth - 20) return;
    const target = Math.max(0, Math.min(layout.width - viewport.clientWidth, (left + right - viewport.clientWidth) / 2));
    // Wait for Motion to finish changing the scrollable width on entry/rotation.
    const timer = window.setTimeout(() => viewport.scrollTo({ left: target, behavior: reduceMotion ? "instant" : "smooth" }), reduceMotion ? 0 : 240);
    return () => window.clearTimeout(timer);
  }, [mobileFocus, markerFrets, firstFret, visibleFrets, space.width, layout.width, layout.neckX, layout.neckWidth, noteMode, reduceMotion]);
  const focusTransition = { duration: reduceMotion ? 0 : 1.2, ease: focusEase };
  const glideTransition = { duration: reduceMotion || noteMode ? 0 : isPlaying ? Math.min(.62, chordDurationMs / 1000 * .38) : .58, ease: glideEase };
  const sceneTarget = {
    width: layout.width, height: layout.height, scale, x: mobileFocus ? "0%" : "-50%", y: "-50%",
    marginTop: showNeck ? 0 : -22,
    "--photo-width": `${layout.photoWidth}px`, "--photo-x": `${layout.photoX}px`, "--photo-y": `${layout.photoY}px`, "--photo-aspect": guitar.aspect,
    "--neck-x": `${layout.neckX}px`, "--neck-y": `${layout.neckY}px`, "--neck-width": `${layout.neckWidth}px`, "--neck-height": `${layout.neckHeight}px`, "--joint-width": `${layout.jointWidth}px`, "--focus-note-size": `${Math.min(28, layout.neckHeight * .15)}px`
  };
  const dissolveMask = focusMode
    ? "linear-gradient(90deg, #000 15%, transparent 65%)"
    : "linear-gradient(90deg, #000 105%, transparent 155%)";
  return <section ref={stageRef} className={`practice-stage ${mobileFocus ? "mobile-focus" : ""} ${noteMode ? "sounding-note-view" : ""} ${showNeck ? "focused" : "whole-guitar"} ${focusMode ? "focus-mode" : ""} ${layout.joined ? "joined-guitar" : "separate-guitar"} ${compact ? "compact-guitar" : ""} ${isPlaying ? "playing" : ""} ${guitar.maple ? "maple-neck" : ""} ${guitar.legacy ? "legacy-photo" : ""}`} aria-label={t("Interactive guitar stage")}>
    <button ref={focusButtonRef} className="stage-focus-toggle" aria-pressed={focusMode} aria-label={t(focusMode ? "Exit focus mode" : "Enter focus mode")} onClick={() => onFocusModeChange(!focusMode)}>
      <WorkspaceIcon name={focusMode ? "collapse" : "focus"} size={16} /><span>{t(focusMode ? "Exit focus" : "Focus mode")}</span>{focusMode ? <kbd>Esc</kbd> : null}
    </button>
    {mobileFocus ? <div className="focus-current-chord"><strong>{chord}</strong><span>{degree}</span></div> : null}
    <div ref={viewportRef} className="instrument-viewport" tabIndex={mobileFocus ? 0 : undefined} role={mobileFocus ? "region" : undefined} aria-label={mobileFocus ? t("Scrollable fretboard") : undefined}>
    {space.width > 0 ? <motion.div className="instrument-composition" initial={false} animate={sceneTarget} transition={mobileFocus ? { duration: reduceMotion ? 0 : .2, ease: focusEase } : focusTransition}>
      <div className="instrument-photo-frame" aria-hidden={focusMode}>
        <motion.div className="instrument-photo-material" initial={false}
          animate={{ opacity: focusMode ? 0 : 1, filter: focusMode ? "blur(22px) saturate(0.4) brightness(1.16)" : "blur(0px) saturate(1) brightness(1)", "--dissolve-mask": dissolveMask, rotateY: focusMode ? -6 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 1.35, ease: [.4, 0, .2, 1], opacity: { duration: reduceMotion ? 0 : 1.2, ease: [.65, 0, .35, 1] } }}>
          <img className="instrument-photo" src={guitar.image} alt={`${guitar.model} — ${guitar.finish}`} draggable={false} />
        </motion.div>
        <motion.div className="photo-voicing" initial={false} animate={{ opacity: showNeck ? 0 : 1 }} transition={focusTransition} role="img" aria-hidden={showNeck} aria-label={t("{chord} fingering on {model}", { chord, model: guitar.model })}>
          <AnimatePresence initial={false}>{markers.map(marker => <motion.span key={marker.string} className={`practice-note ${colorClass(marker.interval)}`} initial={{ opacity: 0 }}
            animate={{ left: `${(guitar.nutX + (1 - 2 ** (-(marker.fret - .5) / 12)) * guitar.scaleLength) * 100}%`, top: `${(guitar.centerY + ((6 - marker.string) / 5 - .5) * .8 / guitar.photoScale) * guitar.aspect * 100}%`, opacity: 1 }}
            exit={{ opacity: 0 }} transition={glideTransition}>{marker.interval}</motion.span>)}</AnimatePresence>
        </motion.div>
      </div>
      <motion.div className="learning-neck" initial={false} animate={{ opacity: showNeck ? 1 : 0 }} transition={focusTransition} aria-hidden={!showNeck}>
        {noteMode ? <div className="neck-open-strings" aria-hidden="true">{markers.filter(marker => marker.fret === 0).map(marker => <span key={marker.midi}
          data-midi={marker.midi} data-string={marker.string} data-fret={0} className={`practice-note open-string ${colorClass(marker.interval)}`}
          style={{ top: `${stringY(marker.string)}%` }} title={`${marker.interval} · ${t("String {string}, open", marker)}`}>0</span>)}</div> : null}
        <div className="neck-ruler" style={{ gridTemplateColumns: `repeat(${visibleFrets}, 1fr)` }} aria-hidden="true">{Array.from({ length: visibleFrets }, (_, i) => <span key={i}>{i + firstFret}</span>)}</div>
        <svg width="0" height="0" aria-hidden="true" className="neck-clip-defs"><defs>
          <clipPath id={contourId} clipPathUnits="objectBoundingBox"><path d="M0,0 C.45,0 .7,.07 1,.07 L1,.93 C.7,.93 .45,1 0,1Z" /></clipPath>
        </defs></svg>
        <motion.div className="neck-joint" initial={false} animate={{ opacity: focusMode ? 0 : 1 }} transition={focusTransition} style={{ clipPath: `url(#${contourId})` }} aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">{strings.map((_, i) => {
            const start = 10 + i * 16;
            return <path key={i} d={`M0 ${start} H100`} />;
          })}</svg>
        </motion.div>
        <div className="neck-surface" role="img" aria-label={t("{chord} fretboard: {positions}", { chord, positions: markers.map(m => t("String {string}, fret {fret}, {interval}", m)).join("; ") })}>
          {firstFret === 1 && <div className="neck-nut" />}
          <div className="neck-grid">
            <div className="neck-frets" style={{ gridTemplateColumns: `repeat(${visibleFrets}, 1fr)` }} aria-hidden="true">{Array.from({ length: visibleFrets }, (_, i) => <i key={i} />)}</div>
            <div className="neck-inlays" aria-hidden="true">{[3, 5, 7, 9, 12, 15, 17, 19, 21].filter(fret => fret >= firstFret && fret < firstFret + visibleFrets).map(fret => <b className={fret === 12 ? "double" : ""} key={fret} style={{ left: `${(fret - firstFret + .5) / visibleFrets * 100}%` }} />)}</div>
            <div className="neck-strings" aria-hidden="true">{(tuning === "drop-d" && noteMode ? ["D", ...strings.slice(1)] : strings).map((name, i) => <span key={i} style={{ top: `${stringY(6 - i)}%`, height: `${2.8 - i * .32}px` }}><small>{name}</small></span>)}</div>
            {noteMode ? markers.filter(marker => marker.fret > 0).map(marker => <span key={`midi-${marker.midi}`} data-midi={marker.midi} data-string={marker.string} data-fret={marker.fret} className={`practice-note ${colorClass(marker.interval)}`}
              style={{ top: `${stringY(marker.string)}%`, left: `${(marker.fret - firstFret + .5) / visibleFrets * 100}%` }} aria-hidden="true">{marker.interval}</span>) : <AnimatePresence initial={false}>{markers.map(marker => <motion.span key={`string-${marker.string}`} data-string={marker.string} data-fret={marker.fret} className={`practice-note ${colorClass(marker.interval)}`}
              style={{ top: `${stringY(marker.string)}%` }}
              initial={{ left: `${Math.max(.18, marker.fret - firstFret + .5) / visibleFrets * 100}%`, opacity: 0, scale: .92 }} animate={{ left: `${Math.max(.18, marker.fret - firstFret + .5) / visibleFrets * 100}%`, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: .92 }} transition={{ ...glideTransition, opacity: { duration: reduceMotion || noteMode ? 0 : .18 } }} aria-hidden="true">
              {marker.interval}
            </motion.span>)}</AnimatePresence>}
          </div>
        </div>
        <div className="neck-caption"><strong>{chord}</strong><span>{degree}</span><i /><span>{noteMode ? t("Suggested note positions") : isPlaying ? t("Following the progression") : t("Find the shape. Hear the movement.")}</span></div>
      </motion.div>
    </motion.div> : null}
    </div>
    {mobileFocus && layout.width > space.width + 1 ? <p className="focus-scroll-hint">{t("Swipe to explore the fretboard")}</p> : null}
    {!showNeck ? <button className="instrument-focus-button" onClick={onFocus}>{t("Focus fretboard")}</button> : null}
  </section>;
}
