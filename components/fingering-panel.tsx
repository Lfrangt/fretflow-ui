"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./language-provider";
import { ChordThumbnail } from "./chord-thumbnail";
import { shapeId, type FretRange, type GuitarMarker } from "@/lib/guitar-voicing";

export function FingeringPanel({ chords, index, onIndex, range, onRange, candidates, selected, onChoose, pinned, onReset, sourceShape, videoFile, onVideo, chordTime }: {
  chords: string[]; index: number; onIndex: (index: number) => void;
  range: FretRange; onRange: (range: FretRange) => void; candidates: GuitarMarker[][]; selected: GuitarMarker[];
  onChoose: (shape: GuitarMarker[]) => void; pinned: boolean; onReset: () => void; sourceShape?: GuitarMarker[];
  videoFile: File | null; onVideo: (file: File | null) => void; chordTime: number;
}) {
  const { t } = useLanguage();
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState("");
  const [speed, setSpeed] = useState(.5);
  const [offset, setOffset] = useState(0);
  const [time, setTime] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!videoFile) { setUrl(""); return; }
    const next = URL.createObjectURL(videoFile); setUrl(next); setOffset(0); setError("");
    return () => URL.revokeObjectURL(next);
  }, [videoFile]);
  function seek(next: number) {
    if (!video.current || !Number.isFinite(video.current.duration)) return;
    video.current.pause(); video.current.currentTime = Math.max(0, Math.min(video.current.duration, next));
  }
  useEffect(() => { seek(chordTime + offset); }, [chordTime, offset]);
  const choices = sourceShape ? [sourceShape, ...candidates.filter(shape => shapeId(shape) !== shapeId(sourceShape))] : candidates;
  return <div className="fingering-panel">
    <p className="field-hint">{t("Choose the neck position that fits your playing. Connected suggestions reduce hand travel; they do not identify the performer's original fingering.")}</p>
    <fieldset className="position-presets"><legend>{t("Preferred fret range")}</legend>{[
      { label: "Lower · 0–5", min: 0, max: 5 }, { label: "Middle · 5–12", min: 5, max: 12 }, { label: "Higher · 8–17", min: 8, max: 17 }
    ].map(preset => <button key={preset.label} aria-pressed={range.min === preset.min && range.max === preset.max} onClick={() => onRange({ min: preset.min, max: preset.max })}>{t(preset.label)}</button>)}</fieldset>
    <p className="field-hint">{t("R&B / Neo-Soul: try compact seventh and ninth shapes higher on the neck, then compare the voice leading by ear.")}</p>
    <label className="field-label">{t("Chord to compare")}<select value={index} onChange={e => onIndex(Number(e.target.value))}>{chords.map((chord, i) => <option value={i} key={i}>{i + 1} · {chord}</option>)}</select></label>
    <details className="video-fingering-reference" open={Boolean(videoFile)}>
      <summary>{t("Compare with a performance video")}</summary>
      <label className="score-file-picker"><span>{videoFile?.name || t("Choose reference video")}</span><input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" onChange={e => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) { setError("Choose a video file for the hand reference."); return; }
        onVideo(file);
      }} /></label>
      {url && <>
        <video key={url} ref={video} src={url} controls muted playsInline preload="metadata" aria-label={t("Fingering reference video")} onLoadedMetadata={() => { if (video.current) video.current.playbackRate = speed; seek(chordTime + offset); }} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onError={() => setError("This video cannot be previewed in your browser. Try MP4 or WebM.")} />
        <div className="reference-controls"><button className="secondary-button" onClick={() => seek(time - .04)}>{t("Back 0.04 s")}</button><button className="secondary-button" onClick={() => seek(time + .04)}>{t("Forward 0.04 s")}</button><label>{t("Video speed")}<select value={speed} onChange={e => { const next = Number(e.target.value); setSpeed(next); if (video.current) video.current.playbackRate = next; }}>{[.25, .5, .75, 1].map(value => <option key={value} value={value}>{value}×</option>)}</select></label></div>
        <label className="field-label">{t("Video start offset (seconds)")}<input type="number" step="0.1" value={offset} onChange={e => setOffset(Number(e.target.value))} /></label>
        <button className="quiet-button" onClick={() => seek(chordTime + offset)}>{t("Jump to this chord in the video")}</button>
        <small>{t("Video time {time} s", { time: time.toFixed(2) })}</small>
      </>}
      <p className="field-hint">{t("The video stays in this browser. Align the start time, pause on the fretting hand, then choose a matching shape below. Visual fingering recognition is not automatic; text-chart timing may need adjustment.")}</p>
      {error && <p role="alert" className="field-error">{t(error)}</p>}
    </details>
    <p className="field-hint">{t("Standard tuning · no capo. Suggested finger numbers are starting points; adjust them for your hand and muting.")}</p>
    <div className="voicing-candidates" role="group" aria-label={t("Alternative fingerings")}>
      {choices.map((shape, i) => <button key={shapeId(shape)} aria-pressed={shapeId(shape) === shapeId(selected)} onClick={() => onChoose(shape)}>
        <ChordThumbnail chord={chords[index]} markers={shape} /><small>{sourceShape && shapeId(shape) === shapeId(sourceShape) ? t("Written in source score") : t("Option {number}", { number: i + 1 })}</small>
      </button>)}
    </div>
    {!choices.length && <p role="status">{t("No suggested shape in this range. Try another range or review the chord symbol.")}</p>}
    {pinned && <button className="secondary-button" onClick={onReset}>{t("Reset this chord to connected suggestions")}</button>}
    <p className="field-hint">{t(pinned ? "Your choice is fixed for this step. Other occurrences of this chord can use different shapes." : "The selected shape connects to the surrounding chords. Choose an option to fix it for this step.")}</p>
  </div>;
}
