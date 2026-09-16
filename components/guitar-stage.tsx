"use client";

import { useLanguage } from "./language-provider";

import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useEffect, useRef, useState } from "react";
import type { DreamGuitar } from "@/lib/dream-guitars";
import { fretCell, photoMarkerPosition, fretboardScrollTarget, guitarLayout, mobileFocusLayout, PRACTICE_FRET_COUNT, rightHandedStringPosition } from "@/lib/guitar-layout";
import { WorkspaceIcon } from "./workspace-icon";

type Marker = { string: number; fret: number; interval: string; finger: number; midi?: number };
const strings = ["e", "B", "G", "D", "A", "E"];
const colorClass = (interval: string) => interval === "R" ? "root" : ["3", "b3"].includes(interval) ? "third" : ["5", "b5", "#5"].includes(interval) ? "fifth" : interval.includes("7") ? "seventh" : "extension";
const stringY = (string: number) => 10 + rightHandedStringPosition(string) * 80;
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
  const scrollAnimationRef = useRef<{ stop: () => void } | null>(null);
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
  // A fixed origin prevents the neck from stretching or renumbering on a change
  // of position. Small screens pan across the same full neck as desktop.
  const lastFret = Math.max(PRACTICE_FRET_COUNT, preferredRange.max, ...markers.map(m => m.fret));
  const firstFret = 1;
  const visibleFrets = lastFret - firstFret + 1;
  const fretColumns = Array.from({ length: visibleFrets }, (_, i) => `minmax(0, ${fretCell(i + 1, lastFret).width}fr)`).join(" ");
  const markerX = (fret: number) => fret === 0 ? fretCell(1, lastFret).width * .18 : fretCell(fret, lastFret).center;
  const compact = space.width < 640;
  // Preserve the shared desktop scene: Focus enlarges the same neck while the
  // attached guitar dissolves. Phones show the full guitar until Focus is entered.
  const mobileFocus = focusMode && (space.width < 900 || phoneLandscape);
  const practiceView = focused && !compact && !phoneLandscape;
  const layout = mobileFocus ? mobileFocusLayout(guitar, space.width, space.height - (phoneLandscape ? 44 : 94), visibleFrets) : guitarLayout(guitar, practiceView, compact, focusMode);
  const showNeck = practiceView || focusMode;
  const scale = mobileFocus ? 1 : Math.max(0, Math.min((space.width - 16) / layout.width, (space.height - (showNeck ? 20 : 64)) / layout.height, 1.15));
  const markerFrets = markers.map(marker => marker.fret).join(",");
  const glideDuration = reduceMotion || noteMode ? 0 : isPlaying ? Math.min(.62, chordDurationMs / 1000 * .38) : .58;
  const scrollDuration = reduceMotion ? 0 : noteMode ? .22 : glideDuration;
  function stopScrollAnimation() { scrollAnimationRef.current?.stop(); }
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    scrollAnimationRef.current?.stop();
    if (!mobileFocus) { viewport.scrollLeft = 0; return; }
    const frets = markerFrets ? markerFrets.split(",").map(Number) : [];
    if (!frets.length) return;
    const target = fretboardScrollTarget({ frets, gridWidth: layout.neckWidth - 14, fretCount: visibleFrets,
      gridX: layout.neckX + 14, viewportWidth: viewport.clientWidth, contentWidth: layout.width, scrollLeft: viewport.scrollLeft });
    if (Math.abs(target - viewport.scrollLeft) < 1) return;
    // Match the fingering glide, interrupt from the current position, and avoid
    // the old delayed browser scroll fighting a new chord or a manual swipe.
    const frame = requestAnimationFrame(() => {
      scrollAnimationRef.current = animate(viewport.scrollLeft, target, {
        duration: scrollDuration, ease: glideEase,
        onUpdate: value => { viewport.scrollLeft = value; }
      });
    });
    scrollAnimationRef.current = { stop: () => cancelAnimationFrame(frame) };
    return () => { cancelAnimationFrame(frame); scrollAnimationRef.current?.stop(); };
  }, [mobileFocus, markerFrets, visibleFrets, space.width, layout.width, layout.neckX, layout.neckWidth, scrollDuration]);
  const focusTransition = { duration: reduceMotion ? 0 : 1.2, ease: focusEase };
  const glideTransition = { duration: glideDuration, ease: glideEase };
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
    <div ref={viewportRef} className="instrument-viewport" tabIndex={mobileFocus ? 0 : undefined} role={mobileFocus ? "region" : undefined} aria-label={mobileFocus ? t("Scrollable fretboard") : undefined}
      onPointerDown={stopScrollAnimation} onTouchStart={stopScrollAnimation} onWheel={stopScrollAnimation} onKeyDown={stopScrollAnimation}>
    {space.width > 0 ? <motion.div className="instrument-composition" initial={false} animate={sceneTarget} transition={mobileFocus ? { duration: reduceMotion ? 0 : .2, ease: focusEase, width: { duration: 0 }, x: { duration: 0 }, scale: { duration: 0 } } : focusTransition}>
      <div className="instrument-photo-frame" aria-hidden={focusMode}>
        <motion.div className="instrument-photo-material" initial={false}
          animate={{ opacity: focusMode ? 0 : 1, filter: focusMode ? "blur(22px) saturate(0.4) brightness(1.16)" : "blur(0px) saturate(1) brightness(1)", "--dissolve-mask": dissolveMask, rotateY: focusMode ? -6 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 1.35, ease: [.4, 0, .2, 1], opacity: { duration: reduceMotion ? 0 : 1.2, ease: [.65, 0, .35, 1] } }}>
          <img className="instrument-photo" src={guitar.image} alt={`${guitar.model} — ${guitar.finish}`} draggable={false} />
        </motion.div>
        <motion.div className="photo-voicing" initial={false} animate={{ opacity: showNeck ? 0 : 1 }} transition={focusTransition} role="img" aria-hidden={showNeck} aria-label={t("{chord} fingering on {model}", { chord, model: guitar.model })}>
          <AnimatePresence initial={false}>{markers.map(marker => <motion.span key={marker.string} className={`practice-note ${colorClass(marker.interval)}`} initial={{ opacity: 0 }}
            animate={{ left: `${photoMarkerPosition(guitar, marker.string, marker.fret).x * 100}%`, top: `${photoMarkerPosition(guitar, marker.string, marker.fret).y * 100}%`, opacity: 1 }}
            exit={{ opacity: 0 }} transition={glideTransition}><span className="photo-note-label">{marker.interval}</span></motion.span>)}</AnimatePresence>
        </motion.div>
      </div>
      <motion.div className="learning-neck" initial={false} animate={{ opacity: showNeck ? 1 : 0 }} transition={focusTransition} aria-hidden={!showNeck}>
        {noteMode ? <div className="neck-open-strings" aria-hidden="true">{markers.filter(marker => marker.fret === 0).map(marker => <span key={marker.midi}
          data-midi={marker.midi} data-string={marker.string} data-fret={0} className={`practice-note open-string ${colorClass(marker.interval)}`}
          style={{ top: `${stringY(marker.string)}%` }} title={`${marker.interval} · ${t("String {string}, open", marker)}`}>0</span>)}</div> : null}
        <div className="neck-ruler" style={{ gridTemplateColumns: fretColumns }} aria-hidden="true">{Array.from({ length: visibleFrets }, (_, i) => <span key={i} data-fret={i + firstFret}>{i + firstFret}</span>)}</div>
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
            <div className="neck-frets" style={{ gridTemplateColumns: fretColumns }} aria-hidden="true">{Array.from({ length: visibleFrets }, (_, i) => <i key={i} data-fret={i + firstFret} />)}</div>
            <div className="neck-inlays" aria-hidden="true">{[3, 5, 7, 9, 12, 15, 17, 19, 21].filter(fret => fret >= firstFret && fret < firstFret + visibleFrets).map(fret => <b className={fret === 12 ? "double" : ""} key={fret} data-fret={fret} style={{ left: `${fretCell(fret, lastFret).center * 100}%` }} />)}</div>
            <div className="neck-strings" aria-hidden="true">{(tuning === "drop-d" && noteMode ? [...strings.slice(0, -1), "D"] : strings).map((name, i) => <span key={i} data-string={i + 1} style={{ top: `${stringY(i + 1)}%`, height: `${1.2 + i * .32}px` }}><small>{name}</small></span>)}</div>
            {noteMode ? markers.filter(marker => marker.fret > 0).map(marker => <span key={`midi-${marker.midi}`} data-midi={marker.midi} data-string={marker.string} data-fret={marker.fret} className={`practice-note ${colorClass(marker.interval)}`}
              style={{ top: `${stringY(marker.string)}%`, left: `${markerX(marker.fret) * 100}%` }} aria-hidden="true">{marker.interval}</span>) : <AnimatePresence initial={false}>{markers.map(marker => <motion.span key={`string-${marker.string}`} data-string={marker.string} data-fret={marker.fret} className={`practice-note ${colorClass(marker.interval)}`}
              style={{ top: `${stringY(marker.string)}%` }}
              initial={{ left: `${markerX(marker.fret) * 100}%`, opacity: 0, scale: .92 }} animate={{ left: `${markerX(marker.fret) * 100}%`, opacity: 1, scale: 1 }}
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
    {!showNeck ? <button className="instrument-focus-button" onClick={compact || phoneLandscape ? () => onFocusModeChange(true) : onFocus}>{t("Focus fretboard")}</button> : null}
  </section>;
}
