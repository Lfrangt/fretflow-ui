"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useLanguage } from "./language-provider";
import { midiName } from "@/lib/practice-performance";
import type { HomePracticeScore } from "@/lib/home-practice-score";

type Props = {
  score: HomePracticeScore | null;
  getTime: () => number;
  seek: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: (cancel: boolean) => void;
  onImport: () => void;
  onUseNotes?: () => void;
  range: { start: number; end: number };
  interactionKey: string;
};
const pixelsPerSecond = 76;

/** A view of the existing practice transport; this component never runs audio. */
export function HomePracticeScoreView(props: Props) {
  const { t } = useLanguage();
  const latest = useRef(props); latest.current = props;
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [time, setTime] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number; time: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const anchor = Math.max(64, Math.min(144, width * .24));
  const hasNotes = Boolean(props.score?.notes.length);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element); setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [hasNotes]);

  useEffect(() => {
    setDragging(false);
    if (!hasNotes) return;
    let frame = 0;
    const read = () => {
      const next = latest.current.getTime();
      setTime(previous => Math.abs(next - previous) > .005 ? next : previous);
      frame = requestAnimationFrame(read);
    };
    read();
    const cancelGesture = () => {
      const current = gesture.current;
      gesture.current = null;
      if (current?.active) latest.current.onScrubEnd(true);
      if (current && viewport.current?.hasPointerCapture(current.id)) viewport.current.releasePointerCapture(current.id);
      setDragging(false);
    };
    const hide = () => { if (document.hidden) cancelGesture(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", hide);
      cancelGesture();
    };
  }, [props.score, hasNotes, props.interactionKey, props.range.start, props.range.end]);

  function finish(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (current.active) {
      if (!cancel && event.type === "pointerup") latest.current.seek(current.time - (event.clientX - current.x) / pixelsPerSecond);
      latest.current.onScrubEnd(cancel); setDragging(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!hasNotes) return <section className="home-tab-empty" aria-label={t("TAB")}>
    <div><strong>{t(props.onUseNotes ? "Use note playback to follow TAB" : props.score?.unplacedNoteCount ? "No playable TAB positions" : "No note TAB in this practice")}</strong><span>{t("Import audio or review notes to add a note score.")}</span></div>
    <button type="button" className="quiet-button" onClick={props.onUseNotes ?? props.onImport}>{t(props.onUseNotes ? "Play notes" : "Import notes")}</button>
  </section>;

  const score = props.score!;
  const left = time - anchor / pixelsPerSecond - .4;
  const right = time + (width - anchor) / pixelsPerSecond + .4;
  // Keep the DOM bounded to the visible passage even for a long recording.
  const visible = score.notes.filter(note => note.start >= left && note.start <= right);
  const steps = score.steps.filter(step => step.start >= left && step.start <= right);
  return <section className="home-practice-tab" aria-label={t("Scrolling TAB")}>
    <header><strong>{t("TAB")} <small>{t("Suggested positions · Beta")}</small></strong><span>{t(dragging ? "Release to seek" : "Drag to seek")}</span></header>
    <div ref={viewport} className={`home-tab-viewport${dragging ? " is-dragging" : ""}`} role="group" tabIndex={0}
      data-time={time.toFixed(3)} aria-label={t("Drag the TAB, or use arrow keys, Home and End to seek")}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: latest.current.getTime(), active: false };
      }}
      onPointerMove={event => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        if (event.pointerType !== "touch" && (event.buttons & 1) === 0) { finish(event, true); return; }
        const dx = event.clientX - current.x, dy = event.clientY - current.y;
        if (!current.active) {
          if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
          if (Math.abs(dx) < 6 || Math.abs(dx) <= Math.abs(dy)) return;
          current.active = true; event.currentTarget.setPointerCapture(event.pointerId);
          latest.current.onScrubStart(); suppressClick.current = true; setDragging(true);
        }
        event.preventDefault(); latest.current.seek(current.time - dx / pixelsPerSecond);
      }}
      onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
      onPointerLeave={() => { if (gesture.current && !gesture.current.active) gesture.current = null; }}
      onLostPointerCapture={event => { if (event.target === event.currentTarget) finish(event, true); }}
      onClickCapture={event => {
        if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
      }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        const current = latest.current.getTime(), delta = event.shiftKey ? 2 : .25;
        const target = event.key === "ArrowLeft" ? current - delta : event.key === "ArrowRight" ? current + delta : event.key === "Home" ? props.range.start : event.key === "End" ? props.range.end - .001 : null;
        if (target !== null) { event.preventDefault(); props.seek(target); }
      }}>
      <svg className="home-tab-staff" width="100%" height="100" aria-hidden="true">
        {["e", "B", "G", "D", "A", score.tuning === "drop-d" ? "D" : "E"].map((label, index) => <g key={index}><line x1="25" x2="100%" y1={22 + index * 13} y2={22 + index * 13} /><text x="7" y={25 + index * 13}>{label}</text></g>)}
        {steps.map(step => <text className="home-tab-step-label" key={step.index} x={anchor + (step.start - time) * pixelsPerSecond} y="9">{step.index + 1}</text>)}
      </svg>
      {visible.map(note => <button key={note.id} type="button" className={`home-tab-note${note.start <= time && time < note.end ? " is-active" : ""}`}
        style={{ left: anchor + (note.start - time) * pixelsPerSecond, top: 22 + (note.string - 1) * 13 }}
        aria-label={t("{pitch}, string {string}, fret {fret}, {seconds} seconds", { pitch: midiName(note.midi), string: note.string, fret: note.fret, seconds: Number(note.start.toFixed(2)) })}
        onClick={() => props.seek(note.start)}>{note.fret}</button>)}
      <div className="home-tab-playhead" style={{ left: anchor }} aria-hidden="true"><i /></div>
    </div>
    {score.unplacedNoteCount > 0 && <p className="home-tab-warning">{t("{count} notes have no available TAB position.", { count: score.unplacedNoteCount })}</p>}
  </section>;
}
