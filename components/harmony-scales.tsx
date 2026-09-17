"use client";

import { useState } from "react";
import { chordScaleCandidates, type KeyName } from "@/lib/harmony";
import { useLanguage } from "./language-provider";

/** A chord-scale reference, independent of transcription and playback. */
export function HarmonyScales({ chord, referenceKey, pitchClasses }: {
  chord: string; referenceKey?: KeyName; pitchClasses: number[];
}) {
  const { t } = useLanguage();
  const [selectedId, setSelectedId] = useState("");
  const candidates = chordScaleCandidates(chord, { key: referenceKey, chordPitchClasses: pitchClasses });
  const selected = candidates.find(candidate => candidate.id === selectedId) ?? candidates[0];

  return <section className="harmony-scales" aria-labelledby="harmony-scales-title">
    <header>
      <h3 id="harmony-scales-title">{t("Candidate scales")}</h3>
      <strong>{chord || "—"}</strong>
    </header>
    <p className="field-hint">{t("References for this chord, not the original song’s scale. Choose by the key, melody and sound.")}</p>
    {selected ? <>
      <div className="harmony-scale-options" role="group" aria-label={t("Choose a candidate scale")}>
        {candidates.map(candidate => <button type="button" key={candidate.id}
          aria-pressed={candidate.id === selected.id} onClick={() => setSelectedId(candidate.id)}>
          {candidate.root} {t(candidate.nameKey)}
        </button>)}
      </div>
      <div className="harmony-scale-detail" aria-live="polite" aria-atomic="true">
        <p className="harmony-scale-reason">{t(selected.reasonKey)}</p>
        {selected.keyMatch && referenceKey ? <p className="harmony-scale-key">{t("Same notes as {key} major", { key: referenceKey })}</p> : null}
        <ul className="harmony-scale-notes" aria-label={t("Scale notes and degrees")}>
          {selected.notes.map((note, index) => <li key={`${note}-${index}`} data-chord-tone={selected.chordToneFlags[index]}>
            <span>{selected.degrees[index]}</span><strong>{note}</strong>
            {selected.chordToneFlags[index] ? <span className="sr-only">{t("Chord tone")}</span> : null}
          </li>)}
        </ul>
        <p className="field-hint">{t("Degrees are relative to the chord root. Highlighted notes belong to the chord or current voicing.")}</p>
      </div>
    </> : <p className="field-hint">{t("No candidate in this small reference set fits all the chord and voicing notes. Use the chord tones as your starting point.")}</p>}
  </section>;
}
