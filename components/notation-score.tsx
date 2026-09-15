"use client";

import { useLanguage } from "./language-provider";

import { useEffect, useRef, useState } from "react";
import { loadNotationEngine } from "@/lib/notation-engine";
import { buildPerformanceMidi, PERFORMANCE_TICKS_PER_SECOND } from "@/lib/performance-midi";
import { NOTATION_BETA_NOTICE, seconds, type DetectedNote } from "@/lib/transcription";
import type { AlphaTabApi, synth } from "@coderline/alphatab";

// This bank contains one real classical-guitar instrument, with no piano or
// other GM presets to fall back to. Both playback paths use the same samples.
const GUITAR_SOUNDFONT = "/soundfonts/freepats-classical-guitar.sf2";

export function NotationScore({ musicxml, name, notes, duration, audioPosition, playbackSpeed, audioPlayToken, onBeforePlay }: {
  musicxml: string; name: string; notes: DetectedNote[]; duration: number; audioPosition: number;
  playbackSpeed: number; audioPlayToken: number; onBeforePlay: () => void;
}) {
  const { t, localize } = useLanguage();
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<AlphaTabApi | null>(null);
  const performance = useRef<synth.IAlphaSynth | null>(null);
  const engineRef = useRef<Awaited<ReturnType<typeof loadNotationEngine>> | null>(null);
  const latestPerformance = useRef({ notes, duration, audioPosition, playbackSpeed, onBeforePlay });
  latestPerformance.current = { notes, duration, audioPosition, playbackSpeed, onBeforePlay };
  const latestXml = useRef(musicxml);
  latestXml.current = musicxml;
  const betaCopy = useRef({ subtitle: t("Beta · notes may be inaccurate · for reference only"), notice: t(NOTATION_BETA_NOTICE) });
  betaCopy.current = { subtitle: t("Beta · notes may be inaccurate · for reference only"), notice: t(NOTATION_BETA_NOTICE) };
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [performanceReady, setPerformanceReady] = useState(false);
  const [performancePlaying, setPerformancePlaying] = useState(false);
  const [performanceTime, setPerformanceTime] = useState(0);
  const [performanceError, setPerformanceError] = useState("");

  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    void loadNotationEngine().then((engine) => {
      const { AlphaTabApi, model } = engine;
      engineRef.current = engine;
      if (disposed || !host.current) return;
      // The browser bundle minifies underscore-prefixed enum aliases. Its
      // numeric reverse names remain stable across the module and UMD builds.
      const guitarClefOttava = Number(Object.entries(model.Ottavia).find(([, name]) => name === "_8vb")?.[0]);
      if (!Number.isInteger(guitarClefOttava)) throw new Error("Guitar octave clef is unavailable");
      const api = new AlphaTabApi(host.current, {
        core: { fontDirectory: "/alphatab/font/", scriptFile: new URL("/alphatab/alphaTab.min.js", window.location.href).href, useWorkers: false, enableLazyLoading: false },
        display: { scale: .9, barsPerRow: -1 },
        player: { playerMode: "enabledsynthesizer", soundFont: GUITAR_SOUNDFONT, enableCursor: true,
          enableUserInteraction: true, scrollElement: ".transcription-body" }
      });
      instance.current = api;
      api.metronomeVolume = 0;
      api.countInVolume = 0;
      api.error.on((e) => setError(String(e)));
      api.playerReady.on(() => setReady(true));
      api.playerStateChanged.on((e) => {
        setPlaying(e.state === 1);
        if (e.state === 1) { performance.current?.pause(); latestPerformance.current.onBeforePlay(); }
      });
      api.scoreLoaded.on((score) => {
        // These fields travel with alphaTab's print/PDF and Guitar Pro exports.
        score.subTitle = betaCopy.current.subtitle;
        score.notices = betaCopy.current.notice;
        score.instructions = betaCopy.current.notice;
        for (const track of score.tracks) {
          track.playbackInfo.program = 24;
          for (const staff of track.staves) {
            staff.showStandardNotation = true;
            staff.showTablature = true;
            staff.standardNotationLineCount = 5;
            // Guitar notation is written one octave above the sounding pitch.
            staff.displayTranspositionPitch = 0;
            for (const bar of staff.bars) bar.clefOttava = guitarClefOttava;
          }
        }
      });
      api.load(new TextEncoder().encode(latestXml.current));
      // A separate synth keeps the performance clock out of the engraved score's
      // tempo/beat lookup. Its player never shows a falsely aligned score cursor.
      const raw = api.uiFacade.createWorkerPlayer();
      if (!raw) { setPerformanceError("Detected timing playback is unavailable."); return; }
      performance.current = raw;
      raw.metronomeVolume = 0;
      raw.countInVolume = 0;
      raw.readyForPlayback.on(() => { if (!disposed) setPerformanceReady(true); });
      raw.stateChanged.on((event) => { if (!disposed) setPerformancePlaying(event.state === 1); });
      raw.positionChanged.on((event) => { if (!disposed) setPerformanceTime(event.currentTick / PERFORMANCE_TICKS_PER_SECOND); });
      raw.midiLoadFailed.on(() => { if (!disposed) setPerformanceError("Detected timing playback is unavailable."); });
      raw.soundFontLoadFailed.on(() => { if (!disposed) setPerformanceError("Detected timing playback is unavailable."); });
      let initialized = false;
      const initialize = () => {
        if (disposed || initialized) return;
        initialized = true;
        const data = latestPerformance.current;
        try {
          raw.playbackSpeed = data.playbackSpeed;
          raw.loadMidiFile(buildPerformanceMidi(engine, data.notes, data.duration));
        } catch { setPerformanceError("Detected timing playback is unavailable."); return; }
        void fetch(GUITAR_SOUNDFONT, { signal: abort.signal }).then(async response => {
          if (!response.ok) throw new Error("Soundfont unavailable");
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!disposed) raw.loadSoundFont(bytes, false);
        }).catch(() => { if (!disposed) setPerformanceError("Detected timing playback is unavailable."); });
      };
      raw.ready.on(initialize);
      if (raw.isReady) initialize();
    }).catch((e) => setError(String(e)));
    return () => {
      disposed = true; abort.abort();
      performance.current?.destroy(); performance.current = null;
      instance.current?.destroy(); instance.current = null;
    };
  }, []);

  useEffect(() => {
    const raw = performance.current;
    if (!raw?.isReady || !engineRef.current) return;
    raw.stop(); setPerformanceReady(false); setPerformanceError("");
    try { raw.loadMidiFile(buildPerformanceMidi(engineRef.current, notes, duration)); }
    catch { setPerformanceError("Detected timing playback is unavailable."); }
  }, [notes, duration]);

  useEffect(() => { if (performance.current) performance.current.playbackSpeed = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { performance.current?.pause(); instance.current?.pause(); }, [audioPlayToken]);

  function playDetectedTiming() {
    const raw = performance.current;
    if (!raw?.isReadyForPlayback) return;
    if (performancePlaying) { raw.pause(); return; }
    instance.current?.pause(); onBeforePlay();
    raw.tickPosition = Math.round(Math.min(audioPosition, Math.max(0, duration - .01)) * PERFORMANCE_TICKS_PER_SECOND);
    raw.playbackSpeed = playbackSpeed;
    if (!raw.play()) setPerformanceError("Detected timing playback is unavailable.");
  }

  useEffect(() => {
    const api = instance.current;
    if (!api) return;
    api.stop();
    setError("");
    api.load(new TextEncoder().encode(musicxml));
  }, [musicxml]);

  useEffect(() => {
    const api = instance.current;
    if (!api?.score) return;
    api.score.subTitle = betaCopy.current.subtitle;
    api.score.notices = betaCopy.current.notice;
    api.score.instructions = betaCopy.current.notice;
    api.render();
  }, [t]);

  async function guitarPro() {
    try {
      const { exporter } = await loadNotationEngine();
      if (!instance.current?.score) return;
      const data = new exporter.Gp7Exporter().export(instance.current.score);
      const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url; link.download = name.replace(/\.[^.]+$/, "") + "-beta.gp"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { console.error("Guitar Pro export failed", cause); setError("Guitar Pro export failed. Please export MusicXML instead."); }
  }

  return <section className="notation-panel" aria-label={t("Guitar score")}>
    <div className="transcription-actions">
      <button disabled={!performanceReady || Boolean(performanceError)} onClick={playDetectedTiming}>{t(performancePlaying ? "Stop detected timing" : "Play detected timing")}</button>
      <small aria-label={t("Detected timing position")}>{seconds(performanceTime)}</small>
      <button disabled={!ready} onClick={() => instance.current?.playPause()}>{playing ? t("Pause score playback") : ready ? t("Play score") : t("Loading score sounds…")}</button>
      <button onClick={() => instance.current?.print()}>{t("Print / Save as PDF (Beta)")}</button>
      <button onClick={() => void guitarPro()}>{t("Export Guitar Pro (Beta)")}</button>
      <small>{t("Score playback uses synthesized sounds. Compare it with the original audio above.")}</small>
    </div>
    <small>{t("Detected timing starts at the audio playhead and preserves estimated picking intervals and sustains. Score playback follows the written rhythm. Neither guarantees correct notes or playing dynamics.")}</small>
    {performanceError && <p role="alert">{t(performanceError)}</p>}
    {error && <p role="alert">{t("Score unavailable: {error}", { error: localize(error) })}</p>}
    <div className="notation-paper" ref={host} />
    <small className="notation-credit">{t("Engraved with")} <a href="https://alphatab.net" target="_blank" rel="noreferrer">alphaTab</a> · MPL-2.0</small>
  </section>;
}
