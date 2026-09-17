"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "./language-provider";
import { analyzeSoloNotes, soloLoop } from "@/lib/solo-review";
import { midiName, notePositions } from "@/lib/practice-performance";
import { seconds, type Transcription } from "@/lib/transcription";

export function SoloReview({ result, time, onSeek, onEdit }: {
  result: Transcription; time: number;
  onSeek: (start: number, end?: number) => void; onEdit: (index: number) => void;
}) {
  const { t } = useLanguage();
  const analysis = useMemo(() => analyzeSoloNotes(result.notes, result.duration), [result.notes, result.duration]);
  const [selected, setSelected] = useState(0);
  const [page, setPage] = useState(0);
  const phraseIndex = Math.min(selected, Math.max(0, analysis.phrases.length - 1));
  const phrase = analysis.phrases[phraseIndex];
  const currentPage = Math.min(page, Math.max(0, Math.ceil((phrase?.indices.length ?? 0) / 12) - 1));
  const settings = result.score_settings;
  const capo = settings.capo ?? 0;
  const range = { min: (settings.fret_min ?? 5) + capo, max: (settings.fret_max ?? 12) + capo };
  const listen = (start: number, end: number) => {
    const loop = soloLoop(start, end, result.duration);
    onSeek(loop.start, loop.end);
  };

  return <section className="solo-review" aria-labelledby="solo-review-title">
    <header><div><h3 id="solo-review-title">{t("Solo · single-note study (Beta)")}</h3><p>{t("Listen to each phrase, check its pitches, then slow it down or correct a note. Bends, slides and vibrato are not transcribed as playing techniques.")}</p></div></header>
    <dl className="solo-metrics">
      <div><dt>{t("Notes kept")}</dt><dd>{analysis.count}</dd></div>
      <div><dt>{t("Estimated pitch range")}</dt><dd>{analysis.low === null ? t("Unknown") : `${midiName(analysis.low)}–${midiName(analysis.high!)}`}</dd></div>
      <div><dt>{t("Phrase groups")}</dt><dd>{analysis.phrases.length}</dd></div>
    </dl>
    <p className="transcription-hint">{t("Phrases are grouped at estimated silences of 0.35 seconds or longer. They are listening guides, not confirmed musical phrasing.")}</p>
    {phrase ? <>
      <div className="solo-phrase-controls">
        <label>{t("Choose a phrase")}<select value={phraseIndex} onChange={event => { setSelected(Number(event.target.value)); setPage(0); }}>
          {analysis.phrases.map((part, index) => <option key={index} value={index}>{t("Phrase {number}", { number: index + 1 })} · {seconds(part.start)}–{seconds(part.end)} · {t("{count} notes", { count: part.indices.length })}</option>)}
        </select></label>
        <button onClick={() => listen(phrase.start, phrase.end)}>{t("Loop this phrase")}</button>
      </div>
      <small>{t("Suggested positions · {tuning} · capo {capo} · preferred frets {min}–{max}", { tuning: settings.tuning === "drop-d" ? "Drop D" : t("Standard E A D G B E"), capo, min: settings.fret_min ?? 5, max: settings.fret_max ?? 12 })}</small>
      <p className="transcription-hint">{t("String 1 is the highest string. Frets are counted from the capo. These are playable suggestions, not the original fingering; change tuning, capo or position in Adjust score below.")}</p>
      <ol className="solo-note-list" start={currentPage * 12 + 1}>
        {phrase.indices.slice(currentPage * 12, currentPage * 12 + 12).map(index => {
          const note = result.notes[index];
          const position = notePositions([note.midi], settings.tuning, range, capo)[0];
          const active = note.start <= time && time < note.end;
          return <li key={index} className={active ? "active" : ""}>
            <button className="solo-note-listen" onClick={() => listen(note.start, note.end)} aria-label={t("Listen to note {number}: {pitch}", { number: index + 1, pitch: midiName(note.midi) })}>
              <strong>{midiName(note.midi)}</strong>
              <small>{seconds(note.start)} · {t("{seconds} s", { seconds: (Math.min(result.duration, note.end) - note.start).toFixed(2) })}</small>
              <span>{position ? t("String {string} · fret {fret}", { string: position.string, fret: position.fret - capo }) : t("Outside this guitar's range")}</span>
            </button>
            <button className="solo-note-edit" onClick={() => onEdit(index)} aria-label={t("Review note {index}: {pitch}", { index: index + 1, pitch: midiName(note.midi) })}>{t("Edit note")}</button>
          </li>;
        })}
      </ol>
      {phrase.indices.length > 12 && <div className="transcription-actions"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("Previous page")}</button><span>{currentPage + 1} / {Math.ceil(phrase.indices.length / 12)}</span><button disabled={(currentPage + 1) * 12 >= phrase.indices.length} onClick={() => setPage(currentPage + 1)}>{t("Next page")}</button></div>}
    </> : <p>{t("No solo notes to review. Try a shorter, clearer single-note clip, or add notes in the editor below.")}</p>}
  </section>;
}
