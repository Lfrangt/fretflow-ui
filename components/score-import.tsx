"use client";

import { useEffect, useRef, useState } from "react";
import type { model } from "@coderline/alphatab";
import { useLanguage } from "./language-provider";
import { ChordThumbnail } from "./chord-thumbnail";
import { loadNotationEngine } from "@/lib/notation-engine";
import { chordParts, parseChordText, parseScoreChords, validateChart, type ImportedChart } from "@/lib/score-import";
import type { GuitarMarker } from "@/lib/guitar-voicing";

const accepted = ".txt,.cho,.pro,.chordpro,.musicxml,.xml,.mxl,.gp,.gpx,.gp3,.gp4,.gp5";
const example = "{title: My practice chart}\n{tempo: 80}\n{time: 4/4}\n[Verse]\n| C | Am | F G | C |\n[Chorus]\n| Am | F | C | G |";

export function ScoreImport({ bpm, markersFor, onUse }: {
  bpm: number; markersFor: (chord: string) => GuitarMarker[]; onUse: (chart: ImportedChart) => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportedChart | null>(null);
  const [score, setScore] = useState<model.Score | null>(null);
  const [part, setPart] = useState("");
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    const revision = ++request.current;
    setBusy(true); setError(""); setPreview(null); setScore(null); setText(""); setFilename(file.name);
    try {
      const extension = "." + file.name.split(".").pop()?.toLowerCase();
      if (!accepted.split(",").includes(extension)) throw new Error("Choose a text, ChordPro, MusicXML or Guitar Pro file. PDF and image recognition are not supported here yet.");
      if (file.size > 8 * 1024 * 1024) throw new Error("Score files must be 8 MB or smaller.");
      if ([".txt", ".cho", ".pro", ".chordpro"].includes(extension)) {
        const source = await file.text();
        if (request.current !== revision) return;
        setText(source); setPreview(parseChordText(source, bpm));
      } else {
        const engine = await loadNotationEngine();
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (request.current !== revision) return;
        let parsed: model.Score;
        try { parsed = engine.importer.ScoreLoader.loadScoreFromBytes(bytes); }
        catch { throw new Error("This score could not be read. Export it again as MusicXML or Guitar Pro and retry."); }
        const parts = chordParts(parsed);
        if (!parts.length) throw new Error("No chord symbols were found. A melody or note-only score does not determine the harmony.");
        setScore(parsed); setPart(parts[0].id);
        setPreview(parseScoreChords(engine, parsed, parts[0].id));
      }
    } catch (cause) { if (request.current === revision) setError((cause as Error).message); }
    finally { if (request.current === revision) setBusy(false); }
  }

  async function choosePart(id: string) {
    if (!score) return;
    const revision = ++request.current;
    setPart(id); setPreview(null); setError(""); setBusy(true);
    try {
      const engine = await loadNotationEngine();
      if (request.current === revision) setPreview(parseScoreChords(engine, score, id));
    } catch (cause) { if (request.current === revision) setError((cause as Error).message); }
    finally { if (request.current === revision) setBusy(false); }
  }

  function readText() {
    setError(""); setScore(null);
    try { setPreview(parseChordText(text, bpm)); } catch (cause) { setPreview(null); setError((cause as Error).message); }
  }

  const shapes = new Map((preview ? [...new Set(preview.steps.map(step => step.chord))] : []).map(chord => [chord, markersFor(chord)]));
  const unsupported = preview ? [...new Set(preview.steps.filter(step => step.chord !== "N.C." && !(step.sourceShape ?? shapes.get(step.chord) ?? []).length).map(step => step.chord))] : [];
  return <div className="score-import">
    <p className="field-hint">{t("Already have a chart you trust? Import its chord symbols, review the playing order, then follow them on the fretboard.")}</p>
    <label className="score-file-picker"><strong>{t("Choose a score file")}</strong><span>{t("Text / ChordPro · MusicXML / MXL · Guitar Pro")}</span><input type="file" accept={accepted} disabled={busy} onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
    <small className="field-hint">{t("Files are read in this browser. PDF and image recognition are not connected; paste their chord symbols below instead.")}</small>
    {filename && <p className="score-source-name">{filename}</p>}
    {!score && <>
      <label className="field-label" htmlFor="score-chord-text">{t("Or paste a chord chart")}</label>
      <textarea id="score-chord-text" value={text} disabled={busy} rows={6} placeholder={"| C | Am | F G | C |\n{tempo: 80}\n[C]lyrics [Am]lyrics"} onChange={event => { setText(event.target.value); setPreview(null); setError(""); setFilename(""); }} />
      <p className="field-hint">{t("Use bar lines or ChordPro [C] lyrics. C:2 means two quarter-note beats. Expand text repeats into the full playing order.")}</p>
      <div className="score-import-actions"><button className="secondary-button" disabled={busy || !text.trim()} onClick={readText}>{t("Preview chord progression")}</button><button className="quiet-button" disabled={busy} onClick={() => { setText(example); setPreview(null); setError(""); setFilename(""); }}>{t("Load example chart")}</button></div>
    </>}
    {score && <label className="field-label">{t("Part containing the chords")}<select value={part} disabled={busy} onChange={event => void choosePart(event.target.value)}>{chordParts(score).map(part => <option key={part.id} value={part.id}>{part.name}</option>)}</select></label>}
    {busy && <p role="status">{t("Reading score…")}</p>}
    {error && <p className="editor-error" role="alert">{t(error)}</p>}
    {preview && <section className="score-import-preview" aria-label={t("Imported chart preview")}>
      <h3>{preview.title === "Imported chord chart" ? t("Imported chord chart") : preview.title}</h3><p className="field-hint">{t("{count} chord steps · review before practicing", { count: preview.steps.length })}</p>
      <label className="field-label">{t("Practice tempo (BPM)")}<input type="number" min={30} max={240} value={preview.bpm} onChange={event => setPreview({ ...preview, bpm: Number(event.target.value) })} /></label>
      <div className="score-import-notices">{preview.notices.map(notice => <p key={notice}>{t(notice)}</p>)}<p>{t("Written chord diagrams are kept when compatible. Other shapes are suggested practice voicings, not the performer's exact fingering. N.C. is a silent step.")}</p></div>
      <ol className="score-import-steps">{preview.steps.map((step, index) => <li key={index}>
        <div className="score-step-name"><small>{index + 1}{step.section ? ` · ${step.section}` : ""}{step.bar ? ` · ${t("Bar {number}", { number: step.bar })}` : ""}</small><strong>{step.chord === "N.C." ? t("N.C. · no chord") : step.chord}</strong></div>
        {step.chord !== "N.C." && (step.sourceShape ?? shapes.get(step.chord) ?? []).length > 0 && <ChordThumbnail chord={step.chord} markers={step.sourceShape ?? shapes.get(step.chord) ?? []} />}
        {step.chord !== "N.C." && !(step.sourceShape ?? shapes.get(step.chord) ?? []).length && <small>{t("Fingering needs review")}</small>}
        <label>{t("Beats")}<input aria-label={t("Beats for step {number}", { number: index + 1 })} type="number" min="0.0625" max="256" step="any" value={step.beats} onChange={event => setPreview({ ...preview, steps: preview.steps.map((old, i) => i === index ? { ...old, beats: Number(event.target.value) } : old) })} /></label>
      </li>)}</ol>
      {unsupported.length > 0 && <p className="editor-error" role="alert">{t("No supported fingering for: {chords}. Correct the source or use a supported chord before applying.", { chords: unsupported.join(", ") })}</p>}
      <button className="action-button full-width" disabled={busy || unsupported.length > 0} onClick={() => { try { onUse(validateChart(preview)); } catch (cause) { setError((cause as Error).message); } }}>{t("Use chart on fretboard")}</button>
    </section>}
  </div>;
}
