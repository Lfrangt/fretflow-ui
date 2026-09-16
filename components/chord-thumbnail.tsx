"use client";

import { useLanguage } from "./language-provider";

type Marker = { string: number; fret: number; interval: string; finger: number };
const colorClass = (interval: string) => interval === "R" ? "root" : ["3", "b3"].includes(interval) ? "third" : ["5", "b5", "#5"].includes(interval) ? "fifth" : interval.includes("7") ? "seventh" : "extension";

export function ChordThumbnail({ chord, markers }: { chord: string; markers: Marker[] }) {
  const { t } = useLanguage();
  if (!markers.length) return <div className="chord-thumbnail empty-chord">{t(chord === "N.C." ? "Rest" : "Fingering needs review")}</div>;
  const fretted = markers.filter(marker => marker.fret > 0);
  const lowest = fretted.length ? Math.min(...fretted.map(marker => marker.fret)) : 1;
  const highest = fretted.length ? Math.max(...fretted.map(marker => marker.fret)) : 1;
  const base = lowest;
  const rows = Math.max(4, highest - base + 1);
  return <svg className="chord-thumbnail" viewBox="0 0 116 112" role="img" aria-label={t("{chord} fingering diagram", { chord })}>
    <title>{markers.map(marker => marker.fret > 0 ? t(marker.finger ? "String {string}, fret {fret}, finger {finger}" : "String {string}, fret {fret}", marker) : t("String {string}, open", marker)).join("; ")}</title>
    {Array.from({ length: 6 }, (_, index) => {
      const marker = markers.find(note => note.string === 6 - index);
      return <g key={index}>
        <line className="thumb-string" x1={18 + index * 16} y1="18" x2={18 + index * 16} y2="82" />
        {!marker || marker.fret === 0 ? <text className="thumb-open" x={18 + index * 16} y="10">{marker ? "○" : "×"}</text> : null}
      </g>;
    })}
    {Array.from({ length: rows + 1 }, (_, index) => <line className={`thumb-fret ${base === 1 && index === 0 ? "nut" : ""}`} key={index} x1="18" x2="98" y1={18 + index * 64 / rows} y2={18 + index * 64 / rows} />)}
    {fretted.map((marker, index) => <g key={index} className={`thumb-note ${colorClass(marker.interval)}`} transform={`translate(${18 + (6 - marker.string) * 16},${18 + (marker.fret - base + .5) * 64 / rows})`}>
      <circle r="7.4" /><text dy=".34em">{marker.finger || "•"}</text>
    </g>)}
    <text className="thumb-position" x="58" y="103">{base === 1 && markers.some(marker => marker.fret === 0) ? t("Open position") : t("Fret {fret}", { fret: base })}</text>
  </svg>;
}
