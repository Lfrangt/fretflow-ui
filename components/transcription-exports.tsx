"use client";

import { useState } from "react";
import { useLanguage } from "./language-provider";
import { api, NOTATION_BETA_NOTICE, TRANSCRIPTION_API, type ScoreDraft, type Transcription } from "@/lib/transcription";
import type { PdfLayout } from "@/lib/transcription-export";

export function TranscriptionExports({ result, score, saving }: { result: Transcription; score: ScoreDraft | null; saving: boolean }) {
  const { t } = useLanguage();
  const hasNotes = result.notes.some(note => !note.excluded);
  const [layout, setLayout] = useState<PdfLayout>(hasNotes ? "scoretab" : "chords");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canPdf = layout === "chords" ? result.chords.length > 0 : hasNotes;
  const url = (kind: string) => `${TRANSCRIPTION_API}/jobs/${result.id}/export/${kind}`;
  async function downloadFile(kind: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url(kind), { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Export HTTP ${response.status}`);
      const { saveExport } = await import("@/lib/transcription-export");
      const name = result.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-");
      saveExport(new Uint8Array(await response.arrayBuffer()), `${name}-${kind}`, response.headers.get("content-type") || "application/octet-stream");
    } catch (cause) { console.error("Score download failed", cause); setError("Export failed. Please try again."); }
    finally { setBusy(false); }
  }
  async function exportFile(format: "pdf" | "gp") {
    setBusy(true); setError("");
    try {
      const { transcriptionPdf, guitarProBytes, saveExport } = await import("@/lib/transcription-export");
      const needsScore = format === "gp" || layout !== "chords";
      const draft = needsScore ? score ?? await api<ScoreDraft>(`/jobs/${result.id}/score`) : null;
      const name = result.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "-");
      const notice = t(layout === "chords" && format === "pdf" ? "Chord estimates need listening review. This chart is a practice reference, not the original arrangement." : NOTATION_BETA_NOTICE);
      const bytes = format === "gp" ? await guitarProBytes(draft!.musicxml, notice) : await transcriptionPdf(result, layout, draft?.musicxml ?? null, {
        title: t(layout === "chords" ? "Chord chart" : layout === "score" ? "Staff notation (Beta)" : layout === "tab" ? "Guitar tabs (Beta)" : "Staff notation & guitar tabs (Beta)"),
        notice, time: t("Time"), chord: t("Chord"), degree: t("Degree"), review: t("Review suggested"), edited: t("Edited"), estimate: t("Model estimate"), source: t("Source offset"), duration: t("Clip duration"),
      });
      saveExport(bytes, `${name}-${format === "gp" ? "beta.gp" : `${layout}.pdf`}`, format === "pdf" ? "application/pdf" : "application/octet-stream");
    } catch (cause) { console.error("Analysis export failed", cause); setError("Export failed. Please try again."); } finally { setBusy(false); }
  }
  return <section className="transcription-export-panel" aria-label={t("Export your analysis")}>
    <header><h3>{t("Export your analysis")}</h3><p>{t("Download a PDF to read or print, or an editable score to continue practicing.")}</p></header>
    <div className="transcription-actions">
      <label>{t("PDF layout")}<select value={layout} disabled={busy} onChange={event => setLayout(event.target.value as PdfLayout)}>
        <option value="chords" disabled={!result.chords.length}>{t("Chord chart")}</option>
        <option value="scoretab" disabled={!hasNotes}>{t("Staff + guitar tabs (Beta)")}</option>
        <option value="score" disabled={!hasNotes}>{t("Staff notation (Beta)")}</option>
        <option value="tab" disabled={!hasNotes}>{t("Guitar tabs (Beta)")}</option>
      </select></label>
      <button disabled={busy || saving || !canPdf} onClick={() => void exportFile("pdf")}>{t(busy ? "Preparing export…" : "Download PDF")}</button>
      <button disabled={busy || saving || !hasNotes} onClick={() => void exportFile("gp")}>{t("Guitar Pro (.gp · Beta)")}</button>
      {hasNotes && <><button disabled={busy || saving} onClick={() => void downloadFile("score.musicxml")}>{t("MusicXML (Beta)")}</button><button disabled={busy || saving} onClick={() => void downloadFile("notes.mid")}>{t("MIDI (notes · Beta)")}</button></>}
      {result.chords.length > 0 && <><button disabled={busy || saving} onClick={() => void downloadFile("chords.txt")}>{t("Chord chart (.txt)")}</button><button disabled={busy || saving} onClick={() => void downloadFile("chords.csv")}>{t("Chord table (.csv)")}</button><button disabled={busy || saving} onClick={() => void downloadFile("chords.mid")}>{t("Chord guide MIDI")}</button></>}
    </div>
    {!hasNotes && <p className="transcription-hint">{t("For staff notation, tabs and Guitar Pro, choose a Beta note analysis first.")}</p>}
    {error && <p role="alert">{t(error)}</p>}
  </section>;
}
