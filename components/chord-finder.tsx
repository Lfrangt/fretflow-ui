"use client";

import { useState } from "react";
import { useLanguage } from "./language-provider";
import { identifyChord, nameShape, PITCH_NAMES, STANDARD_OPEN } from "@/lib/chord-finder";
import type { GuitarMarker } from "@/lib/guitar-voicing";

export function ChordFinder({ shape, onChange, onPreview, onAdd }: {
  shape: GuitarMarker[]; onChange: (shape: GuitarMarker[]) => void;
  onPreview: (shape: GuitarMarker[]) => void; onAdd: (name: string, shape: GuitarMarker[]) => void;
}) {
  const { t } = useLanguage();
  const [first, setFirst] = useState(() => Math.max(1, Math.min(17, (shape.some(m => m.fret > 0) ? Math.min(...shape.filter(m => m.fret > 0).map(m => m.fret)) : 1))));
  const [choice, setChoice] = useState("");
  const matches = identifyChord(shape);
  const selected = matches.find(match => match.name === choice) ?? matches[0];
  function pick(string: number, fret: number) {
    const remaining = shape.filter(m => m.string !== string);
    onChange(fret < 0 || shape.some(m => m.string === string && m.fret === fret) ? remaining
      : [...remaining, { string, fret, interval: "", finger: 0 }].sort((a,b) => a.string - b.string));
    setChoice("");
  }
  return <div className="chord-finder">
    <p className="field-hint">{t("Tap one position per string to find a chord. Tap it again to mute. Standard tuning, no capo.")}</p>
    <label className="finder-position">{t("Fretboard position")}<select value={first} onChange={event => setFirst(Number(event.target.value))}>
      {Array.from({ length: 17 }, (_, i) => <option key={i} value={i + 1}>{t("Frets {min}–{max}", { min: i + 1, max: i + 5 })}</option>)}
    </select></label>
    <div className="finder-board" role="group" aria-label={t("Choose fretboard positions")}>
      <div className="finder-ruler" aria-hidden="true"><span>×</span><span>0</span>{Array.from({ length: 5 }, (_, i) => <span key={i}>{first + i}</span>)}</div>
      {Array.from({ length: 6 }, (_, i) => {
        const string = i + 1, current = shape.find(m => m.string === string);
        return <div className="finder-string" key={string}>
          <button aria-label={t("Mute string {string}", { string })} aria-pressed={!current} onClick={() => pick(string, -1)}>×</button>
          {[0, ...Array.from({ length: 5 }, (_, i) => first + i)].map(fret => <button key={fret} aria-label={t("String {string}, fret {fret}, {interval}", { string, fret, interval: PITCH_NAMES[(STANDARD_OPEN[string] + fret) % 12] })}
            aria-pressed={current?.fret === fret} onClick={() => pick(string, fret)}>{current?.fret === fret ? PITCH_NAMES[(STANDARD_OPEN[string] + fret) % 12] : fret === 0 ? PITCH_NAMES[STANDARD_OPEN[string] % 12] : "·"}</button>)}
        </div>;
      })}
    </div>
    <p className="field-hint">{t("Selected frets, low E to high E")}: <strong>{[6,5,4,3,2,1].map(string => shape.find(m => m.string === string)?.fret ?? "×").join(" · ")}</strong></p>
    <div className="finder-result" aria-live="polite">
      <strong>{selected?.name ?? t(shape.length ? "No exact chord match" : "Choose some notes")}</strong>
      <p className="field-hint">{t(matches.length ? "Possible names for these notes. Choose the name that fits your music." : "Single notes and unmatched shapes can still be auditioned. Add notes to explore chord names.")}</p>
      {matches.length > 0 && <div className="finder-matches" role="group" aria-label={t("Possible chord names")}>{matches.map(match => <button key={match.name} aria-pressed={selected?.name === match.name} onClick={() => setChoice(match.name)}>{match.name}</button>)}</div>}
      {selected?.omittedFifth && <small>{t("Fifth omitted in this voicing")}</small>}
    </div>
    <div className="finder-actions"><button className="secondary-button" disabled={!shape.length} onClick={() => onPreview(nameShape(shape, selected?.root))}>{t("Hear this shape")}</button><button className="quiet-button" disabled={!shape.length} onClick={() => { onChange([]); setChoice(""); }}>{t("Clear positions")}</button></div>
    <button className="action-button full-width" disabled={!selected} onClick={() => { if (selected) onAdd(selected.name, nameShape(shape, selected.root)); }}>{t("Add shape to progression")}</button>
  </div>;
}
