"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "./language-provider";
import { ToneKnob } from "./tone-knob";
import { useToneRig } from "./use-tone-rig";
import { resumeAudioPlayback } from "@/lib/audio-playback";
import { DEFAULT_TONE_RIG, TONE_RIG_PRESETS, type ToneRigSettings } from "@/lib/tone-rig";
import { attachToneRig } from "@/lib/tone-store";

type ToneGuideProps = {
  onBeforePlay?: () => void;
  stopToken?: number;
  onPracticeToggle?: () => void;
  practicePlaying?: boolean;
};

const effects = [
  { key: "boost", enabled: "boostEnabled", name: "Booster", control: "Boost amount", detail: "Drive" },
  { key: "chorus", enabled: "chorusEnabled", name: "Chorus", control: "Chorus mix", detail: "Width" },
  { key: "delay", enabled: "delayEnabled", name: "Delay", control: "Delay mix", detail: "Echo" },
  { key: "reverb", enabled: "reverbEnabled", name: "Reverb", control: "Reverb mix", detail: "Space" },
] as const;

function equalSettings(a: ToneRigSettings, b: ToneRigSettings) {
  return (Object.keys(a) as (keyof ToneRigSettings)[]).every(key => a[key] === b[key]);
}

/** An E-minor phrase repeats through the same live graph as practice playback. */
function startAudition(context: AudioContext) {
  const rig = attachToneRig(context);
  const voices = new Set<OscillatorNode>();
  const gains = new Set<GainNode>();
  const partials = new Float32Array([0, 1, .43, .25, .16, .09, .06, .035]);
  const wave = context.createPeriodicWave(new Float32Array(partials.length), partials);
  const notes = [164.81, 246.94, 293.66, 392, 329.63, 293.66, 246.94, 196];
  let nextPhrase = context.currentTime + .04;
  let disposed = false;
  function schedule() {
    if (disposed || context.state !== "running") return;
    if (nextPhrase < context.currentTime) nextPhrase = context.currentTime + .04;
    if (nextPhrase > context.currentTime + .18) return;
    notes.forEach((frequency, index) => {
      const start = nextPhrase + index * .34;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(index % 4 === 0 ? .13 : .105, start + .006);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + .69);
      oscillator.connect(envelope).connect(rig.input);
      voices.add(oscillator); gains.add(envelope);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); voices.delete(oscillator); gains.delete(envelope); };
      oscillator.start(start); oscillator.stop(start + .71);
    });
    nextPhrase += 3.06;
  }
  schedule();
  const timer = setInterval(schedule, 100);
  return () => {
    disposed = true; clearInterval(timer);
    for (const oscillator of voices) { try { oscillator.stop(); } catch { /* A scheduled voice may have ended. */ } oscillator.disconnect(); }
    for (const envelope of gains) envelope.disconnect();
    voices.clear(); gains.clear(); rig.dispose();
  };
}

export function ToneGuide({ onBeforePlay, stopToken, onPracticeToggle, practicePlaying = false }: ToneGuideProps) {
  const { t } = useLanguage();
  const { settings, presets, setSettings, savePreset, deletePreset } = useToneRig();
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const presetId = useId();
  const nameId = useId();
  const context = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null);
  const stop = useCallback(() => {
    pending.current?.abort(); pending.current = null;
    stopRef.current?.(); stopRef.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => {
    function visibilityChanged() { if (document.hidden) stop(); }
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      pending.current?.abort(); stopRef.current?.();
      void context.current?.close(); context.current = null;
    };
  }, [stop]);
  useEffect(() => { stop(); }, [stopToken, stop]);
  const builtIn = TONE_RIG_PRESETS.find(preset => equalSettings(settings, preset.settings));
  const custom = presets.find(preset => equalSettings(settings, preset.settings));
  const presetLimitReached = presets.length >= 24 && !presets.some(preset => preset.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const selectedPreset = custom ? `user:${custom.id}` : builtIn ? `factory:${builtIn.id}` : "edited";
  function update<K extends keyof ToneRigSettings>(key: K, value: ToneRigSettings[K]) {
    setSettings({ ...settings, [key]: value }); setNotice("");
  }
  async function play() {
    if (playing) { stop(); return; }
    stop(); setError(""); onBeforePlay?.();
    const controller = new AbortController(); pending.current = controller;
    try {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) throw new Error("Audio unavailable");
      context.current ??= new Audio();
      if (!(await resumeAudioPlayback(context.current, controller.signal))) {
        if (!controller.signal.aborted) setError("Audio could not start. Tap Play to retry.");
        return;
      }
      if (controller.signal.aborted) return;
      stopRef.current = startAudition(context.current); setPlaying(true);
    } catch {
      if (!controller.signal.aborted) { stop(); setError("Audio could not start. Tap Play to retry."); }
    }
  }
  const chain = [
    { name: "Booster", active: settings.boostEnabled },
    { name: "Amp + EQ", active: true },
    { name: "Cabinet", active: true },
    { name: "Chorus", active: settings.chorusEnabled },
    { name: "Delay", active: settings.delayEnabled },
    { name: "Reverb", active: settings.reverbEnabled },
  ];
  return <section className="tone-rig" aria-label={t("Tone Studio")} data-bypassed={!settings.enabled || undefined}>
    <header className="tone-rig-header">
      <div><span className="tone-eyebrow">{t("FretFlow · Sound workshop")}</span><h3>{t("Tone Studio")}</h3></div>
      <button className="tone-power" aria-pressed={settings.enabled} onClick={() => update("enabled", !settings.enabled)}>
        <span className="tone-led" aria-hidden="true" />{t(settings.enabled ? "Rig on" : "Bypassed")}
      </button>
    </header>
    <div className="tone-preset-bar">
      <div className="tone-preset-field"><label htmlFor={presetId}>{t("Tone preset")}</label>
        <select id={presetId} value={selectedPreset} onChange={event => {
          const value = event.target.value;
          const preset = value.startsWith("factory:") ? TONE_RIG_PRESETS.find(item => `factory:${item.id}` === value) : presets.find(item => `user:${item.id}` === value);
          if (preset) { setSettings({ ...preset.settings }); setNotice(""); }
        }}>
          <option value="edited" disabled>{t("Custom tone · unsaved")}</option>
          <optgroup label={t("Factory presets")}>{TONE_RIG_PRESETS.map(preset => <option key={preset.id} value={`factory:${preset.id}`}>{t(preset.name)}</option>)}</optgroup>
          {presets.length > 0 && <optgroup label={t("Your presets")}>{presets.map(preset => <option key={preset.id} value={`user:${preset.id}`}>{preset.name}</option>)}</optgroup>}
        </select>
      </div>
      <button className="tone-small-button" aria-expanded={saving} onClick={() => { setSaving(!saving); setNotice(""); }}>{t("Save preset")}</button>
      {custom && <button className="tone-small-button tone-delete" onClick={() => { deletePreset(custom.id); setNotice("Preset deleted. Your current sound is unchanged."); }}>{t("Delete preset")}</button>}
    </div>
    {saving && <form className="tone-save-form" onSubmit={event => {
      event.preventDefault(); if (!name.trim() || presetLimitReached) return;
      savePreset(name.trim()); setName(""); setSaving(false); setNotice("Preset saved on this device.");
    }}>
      <label htmlFor={nameId}>{t("Preset name")}</label>
      <div><input id={nameId} value={name} maxLength={40} autoFocus required placeholder={t("My favorite tone")} onChange={event => setName(event.target.value)} /><button className="tone-small-button" type="submit" disabled={!name.trim() || presetLimitReached}>{t("Save")}</button></div>
      {presetLimitReached && <p className="tone-preset-limit">{t("You have 24 presets. Use an existing name to update it, or delete a preset first.")}</p>}
    </form>}
    <div className="tone-rig-actions">
      <div className="tone-playback-actions"><button className="tone-audition-button" onClick={() => void play()} aria-pressed={playing}><span aria-hidden="true">{playing ? "■" : "▶"}</span>{t(playing ? "Stop audition" : "Audition loop")}</button>
        {onPracticeToggle && <button className="tone-small-button" onClick={() => { stop(); onPracticeToggle(); }}>{t(practicePlaying ? "Pause progression" : "Play progression")}</button>}
        <button className="tone-reset" onClick={() => { setSettings({ ...DEFAULT_TONE_RIG }); setNotice("Tone reset to clean."); }}>{t("Reset")}</button>
      </div>
    </div>
    <div className="tone-main-controls">
      <section className="tone-module tone-amp" aria-label={t("Amplifier")}>
        <div className="tone-module-heading"><h4>{t("Amplifier")}</h4><span>01</span></div>
        <div className="tone-amp-types" role="group" aria-label={t("Amp character")}>
          {([ ["clean", "Clean"], ["crunch", "Crunch"], ["lead", "Lead"] ] as const).map(([amp, label]) => <button key={amp} aria-pressed={settings.amp === amp} onClick={() => update("amp", amp)}>{t(label)}</button>)}
        </div>
        <div className="tone-amp-knobs"><ToneKnob label={t("Gain")} value={settings.gain} onChange={value => update("gain", value)} /><ToneKnob label={t("Volume")} value={settings.volume} onChange={value => update("volume", value)} />
          <div className="tone-cabinet"><span className="tone-cabinet-icon" aria-hidden="true"><i /><i /></span><label>{t("Cabinet")}<select value={settings.cabinet} onChange={event => update("cabinet", event.target.value as ToneRigSettings["cabinet"])}><option value="open">{t("Open back")}</option><option value="stack">{t("Stack")}</option></select></label></div>
        </div>
      </section>
      <section className="tone-module tone-eq" aria-label={t("Equalizer")}>
        <div className="tone-module-heading"><h4>{t("Equalizer")}</h4><span>02</span></div>
        <p className="tone-module-note">{t("Shape the body, brightness and bite.")}</p>
        <div className="tone-eq-knobs">
          <ToneKnob label={t("Bass EQ")} value={settings.bass} onChange={value => update("bass", value)} />
          <ToneKnob label={t("Middle")} value={settings.middle} onChange={value => update("middle", value)} />
          <ToneKnob label={t("Treble")} value={settings.treble} onChange={value => update("treble", value)} />
          <ToneKnob label={t("Presence")} value={settings.presence} onChange={value => update("presence", value)} />
        </div>
      </section>
    </div>
    <section className="tone-module tone-fx" aria-label={t("Effects")}>
      <div className="tone-module-heading"><h4>{t("Effects")}</h4><span>03</span></div>
      <div className="tone-effects-grid">{effects.map(effect => <div key={effect.key} className="tone-effect" data-active={settings[effect.enabled] || undefined}>
        <button className="tone-effect-switch" aria-label={t("Toggle {effect}", { effect: t(effect.name) })} aria-pressed={settings[effect.enabled]} onClick={() => update(effect.enabled, !settings[effect.enabled])}>
          <span className="tone-led" aria-hidden="true" /><strong>{t(effect.name)}</strong><span>{t(settings[effect.enabled] ? "On" : "Off")}</span>
        </button>
        <div className="tone-effect-body"><ToneKnob label={t(effect.control)} value={settings[effect.key]} onChange={value => update(effect.key, value)} disabled={!settings[effect.enabled]} /><span className="tone-effect-character">{t(effect.detail)}</span></div>
      </div>)}</div>
      <details className="tone-delay-detail"><summary>{t("Delay timing")}<span>{settings.delayTime} {t("ms")}</span></summary><label>{t("Time between echoes")}<input aria-label={t("Delay time")} type="range" min={80} max={800} step={10} value={settings.delayTime} disabled={!settings.delayEnabled} onChange={event => update("delayTime", Number(event.target.value))} /><output>{settings.delayTime} {t("ms")}</output></label></details>
    </section>
    <div className="tone-signal"><span className="tone-eyebrow">{t("Signal chain")}</span><ol aria-label={t("Signal chain")}>{chain.map(block => <li key={block.name} data-active={settings.enabled && block.active || undefined}><span className="tone-led" aria-hidden="true" />{t(block.name)}<span className="tone-sr-only"> — {t(settings.enabled && block.active ? "On" : "Off")}</span></li>)}</ol></div>
    <div className="tone-rig-footer">
      <p className="tone-scope">{t("Turn a knob while playing to hear it live. Applies to FretFlow’s synthesized notes and chords; source recordings stay unchanged.")}</p>
      <p className="tone-gesture-hint">{t("Drag knobs up or down · Arrow keys for fine control")}</p>
    </div>
    {notice && <p className="tone-status" role="status">{t(notice)}</p>}
    {error && <p className="tone-error" role="alert">{t(error)}</p>}
  </section>;
}
