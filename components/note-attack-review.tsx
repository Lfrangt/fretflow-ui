"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "./language-provider";
import { groupEstimatedAttacks } from "@/lib/note-attacks";
import { seconds, type DetectedNote } from "@/lib/transcription";

export function NoteAttackReview({ notes, duration, onSeek, onEdit }: {
  notes: DetectedNote[]; duration: number;
  onSeek: (start: number, end: number) => void; onEdit: (index: number) => void;
}) {
  const { t } = useLanguage();
  const groups = useMemo(() => groupEstimatedAttacks(notes), [notes]);
  const [onlyReview, setOnlyReview] = useState(false);
  const [page, setPage] = useState(0);
  const rows = onlyReview ? groups.filter(g => g.kind !== "single" || g.ringing.length > 0 || g.harmonicPairs.length > 0) : groups;
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const currentPage = Math.min(page, pages - 1);
  return <details className="note-attack-review">
    <summary>{t("Single notes & double stops")}</summary>
    <p>{t("A new pluck and a previous note still ringing are different. These groups are estimates; a double-stop candidate needs two real notes, not just two overlapping detections.")}</p>
    <div className="transcription-actions">
      <span>{t("{single} single-attack candidates · {double} double-stop candidates", { single: groups.filter(g => g.kind === "single").length, double: groups.filter(g => g.kind === "double").length })}</span>
      <label><input type="checkbox" checked={onlyReview} onChange={e => { setOnlyReview(e.target.checked); setPage(0); }} /> {t("Show overlaps and harmonic questions")}</label>
    </div>
    <ol className="note-attack-list" start={currentPage * 8 + 1}>
      {rows.slice(currentPage * 8, currentPage * 8 + 8).map(group => <li key={group.indices[0]}>
        <div className="transcription-actions">
          <button onClick={() => onSeek(Math.max(0, group.start - .15), Math.min(duration, group.start + 1.4))}>{t("Listen at {time}", { time: seconds(group.start) })}</button>
          <strong>{t(group.kind === "single" ? "Single attack (estimated)" : group.kind === "double" ? "Double-stop candidate" : group.kind === "unison" ? "Unison overlap · review" : "Multiple-note candidate")}</strong>
          <span>{group.indices.map(i => notes[i].name).join(" + ")}</span>
        </div>
        {group.ringing.length > 0 && <small>{t("Already ringing: {notes}. These are not counted as new plucks.", { notes: [...new Set(group.ringing.map(i => notes[i].name))].join(" / ") })}</small>}
        {group.harmonicPairs.length > 0 && <p className="note-attack-question">{t("Harmonic question: {notes}. Listen before keeping or removing the upper note; a real octave double stop must be preserved.", { notes: group.harmonicPairs.map(([a, b]) => `${notes[a].name} / ${notes[b].name}`).join("; ") })}</p>}
        <div className="transcription-actions">{group.indices.map(i => <button key={i} onClick={() => onEdit(i)}>{t("Review note {index}: {pitch}", { index: i + 1, pitch: notes[i].name })}</button>)}</div>
      </li>)}
    </ol>
    {!rows.length && <p>{t("No note groups to review.")}</p>}
    <div className="transcription-actions"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("Previous page")}</button><span>{currentPage + 1} / {pages}</span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>{t("Next page")}</button></div>
  </details>;
}
