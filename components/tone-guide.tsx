"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./language-provider";
import { resumeAudioPlayback } from "@/lib/audio-playback";
import { previewTone, TONE_CONTROLS, TONE_STARTS, validTone, type ToneSettings } from "@/lib/tone-guide";

export function ToneGuide({ onBeforePlay, stopToken }: { onBeforePlay?: () => void; stopToken?: number }) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<ToneSettings>(TONE_STARTS[0].settings);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const context = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<AbortController | null>(null);
  function stop() {
    pending.current?.abort(); pending.current = null;
    stopRef.current?.(); stopRef.current = null;
    if (timer.current) clearTimeout(timer.current);
    setPlaying(false);
  }
  useEffect(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem("fretflow-tone-guide-v1") || "null"); if (validTone(saved)) setSettings(saved); } catch { /* Defaults are ready. */ }
    setLoaded(true);
    return () => { pending.current?.abort(); stopRef.current?.(); if (timer.current) clearTimeout(timer.current); void context.current?.close(); context.current = null; };
  }, []);
  useEffect(() => { stop(); }, [stopToken]);
  useEffect(() => { if (loaded) { try { localStorage.setItem("fretflow-tone-guide-v1", JSON.stringify(settings)); } catch { /* Session still works. */ } } }, [settings, loaded]);
  function update(next: ToneSettings) { stop(); setSettings(next); }
  async function play() {
    if (playing) { stop(); return; }
    stop(); setError(""); onBeforePlay?.();
    const controller = new AbortController(); pending.current = controller;
    try {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) throw new Error("Audio unavailable");
      context.current ??= new Audio();
      if (!(await resumeAudioPlayback(context.current, controller.signal))) { if (!controller.signal.aborted) setError("Audio could not start. Tap Play to retry."); return; }
      if (controller.signal.aborted) return;
      stopRef.current = previewTone(context.current, settings); setPlaying(true);
      timer.current = setTimeout(stop, 3700);
    } catch { if (!controller.signal.aborted) setError("Audio could not start. Tap Play to retry."); }
  }
  return <section className="tone-guide" aria-label={t("Tone starting points")}>
    <p className="field-hint">{t("Choose a sound by ear, then try these 0–10 settings on your gear. These are starting points, not settings identified from your recording; different amps respond differently.")}</p>
    <div className="tone-starts" role="group" aria-label={t("Choose a tone starting point")}>{TONE_STARTS.map(preset => <button key={preset.name} aria-pressed={TONE_CONTROLS.every(({ key }) => settings[key] === preset.settings[key])} onClick={() => update(preset.settings)}>{t(preset.name)}</button>)}</div>
    <div className="tone-controls">{TONE_CONTROLS.map(control => <label key={control.key}><span>{t(control.label)} <output>{settings[control.key]} / 10</output></span><input aria-label={t(control.label)} type="range" min="0" max="10" step="1" value={settings[control.key]} onChange={event => update({ ...settings, [control.key]: Number(event.target.value) })} /><small>{t(control.help)}</small></label>)}</div>
    <div className="finder-actions"><button className="secondary-button" onClick={() => void play()}>{t(playing ? "Stop tone preview" : "Preview these settings")}</button><button className="quiet-button" onClick={() => update(TONE_STARTS[0].settings)}>{t("Reset tone guide")}</button></div>
    <small>{t("Preview uses a short synthesized phrase to compare the controls. It does not model your guitar, amp or the original recording. Changing a knob stops the preview; press Preview to hear the new settings.")}</small>
    {error && <p role="alert">{t(error)}</p>}
    <a href="https://articles.boss.info/out-of-box-setup-tips-for-your-boss-katana/" target="_blank" rel="noreferrer">{t("Learn amp controls · BOSS guide")}</a>
  </section>;
}
