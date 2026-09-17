"use client";

import { useLanguage } from "./language-provider";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { loadNotationEngine } from "@/lib/notation-engine";
import { findScoreCursorBeat } from "@/lib/score-cursor";
import { buildPerformanceMidi, PERFORMANCE_TICKS_PER_SECOND } from "@/lib/performance-midi";
import { createTonePlayer } from "@/lib/tone-synth";
import { NOTATION_BETA_NOTICE, seconds, type DetectedNote } from "@/lib/transcription";
import type { AlphaTabApi, synth } from "@coderline/alphatab";

// This bank contains one real classical-guitar instrument, with no piano or
// other GM presets to fall back to. Both playback paths use the same samples.
const GUITAR_SOUNDFONT = "/soundfonts/freepats-classical-guitar.sf2";

function pauseScore(api: AlphaTabApi | null) {
  if (!api) return;
  // alphaTab normally snaps a pause to the start of its current beat.
  const tick = api.tickPosition;
  api.pause();
  api.tickPosition = tick;
}

function alignScoreCursor(api: AlphaTabApi) {
  const lookup = findScoreCursorBeat(api.tickCache, api.tracks.map(track => track.index), api.tickPosition);
  if (!lookup) return;
  const bounds = api.boundsLookup?.findBeat(lookup.beat);
  if (!bounds) return;
  const scroll = api.uiFacade.getScrollContainer();
  api.uiFacade.stopScrolling(scroll);
  if (api.settings.display.layoutMode === 1) {
    const next = lookup.nextBeat ? api.boundsLookup?.findBeat(lookup.nextBeat.beat) : undefined;
    const endX = next?.onNotesX ?? bounds.realBounds.x + bounds.realBounds.w;
    const progress = lookup.tickDuration > 0 ? Math.max(0, Math.min(1, (api.tickPosition - lookup.start) / lookup.tickDuration)) : 0;
    const x = bounds.onNotesX + (endX - bounds.onNotesX) * progress;
    // Horizontal Smooth's built-in forceScrollTo currently scrolls the Y axis.
    // Use the same beat lookup as the synth for paused seeks and re-following.
    api.uiFacade.scrollToX(scroll, x + api.settings.player.scrollOffsetX, 0);
  } else {
    const system = bounds.barBounds.masterBarBounds.staffSystemBounds;
    api.uiFacade.scrollToY(scroll, system?.realBounds.y ?? bounds.realBounds.y, 0);
  }
}

export function NotationScore({ musicxml, name, notes, duration, audioPosition, playbackSpeed, audioPlayToken, revision, onBeforePlay }: {
  musicxml: string; name: string; notes: DetectedNote[]; duration: number; audioPosition: number;
  playbackSpeed: number; audioPlayToken: number; revision?: number; onBeforePlay: () => void;
}) {
  const { t, localize } = useLanguage();
  const [soloTrack, setSoloTrack] = useState(0);
  const [scoreVersion, setScoreVersion] = useState(0);
  const hasTwoTracks = notes.some(note => note.track === 2);
  const activeTrack = hasTwoTracks ? soloTrack : 0;
  const playbackNotes = useMemo(() => activeTrack ? notes.filter(note => (note.track ?? 1) === activeTrack) : notes, [notes, activeTrack]);
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const instance = useRef<AlphaTabApi | null>(null);
  const performance = useRef<synth.IAlphaSynth | null>(null);
  const engineRef = useRef<Awaited<ReturnType<typeof loadNotationEngine>> | null>(null);
  const latestPerformance = useRef({ notes: playbackNotes, duration, audioPosition, playbackSpeed, onBeforePlay });
  latestPerformance.current = { notes: playbackNotes, duration, audioPosition, playbackSpeed, onBeforePlay };
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
  const [viewMode, setViewMode] = useState<"page" | "scrolling">("scrolling");
  const [follow, setFollow] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [cursorAnchor, setCursorAnchor] = useState(96);
  const [scorePosition, setScorePosition] = useState({ time: 0, end: 0 });
  const [scoreSpeed, setScoreSpeed] = useState(playbackSpeed);
  const latestScoreSpeed = useRef(scoreSpeed);
  latestScoreSpeed.current = scoreSpeed;
  const [writtenCursor, setWrittenCursor] = useState(false);
  const [scoreAtEnd, setScoreAtEnd] = useState(false);
  const [playableTracks, setPlayableTracks] = useState<number[]>([]);
  const canPlayScore = ready && playableTracks.some(track => !activeTrack || track === activeTrack);
  const canPlayDetected = playbackNotes.some(note => !note.excluded && note.end > note.start);
  const displayState = useRef({ viewMode, follow, reducedMotion, cursorAnchor });
  displayState.current = { viewMode, follow, reducedMotion, cursorAnchor };
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update(); preference.addEventListener("change", update);
    const resize = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width) setCursorAnchor(Math.round(Math.max(64, Math.min(144, width * .24))));
    });
    if (viewport.current) resize.observe(viewport.current);
    return () => { preference.removeEventListener("change", update); resize.disconnect(); };
  }, []);

  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    void loadNotationEngine().then((engine) => {
      const { AlphaTabApi, model } = engine;
      engineRef.current = engine;
      if (disposed || !host.current || !viewport.current) return;
      // The browser bundle minifies underscore-prefixed enum aliases. Its
      // numeric reverse names remain stable across the module and UMD builds.
      const guitarClefOttava = Number(Object.entries(model.Ottavia).find(([, name]) => name === "_8vb")?.[0]);
      if (!Number.isInteger(guitarClefOttava)) throw new Error("Guitar octave clef is unavailable");
      const api = new AlphaTabApi(host.current, {
        core: { fontDirectory: "/alphatab/font/", scriptFile: new URL("/alphatab/alphaTab.min.js", window.location.href).href, useWorkers: false, enableLazyLoading: false },
        display: { scale: .9, barsPerRow: -1, layoutMode: engine.LayoutMode.Horizontal },
        player: { playerMode: "disabled", soundFont: GUITAR_SOUNDFONT, enableCursor: true,
          enableUserInteraction: true, scrollElement: viewport.current, scrollMode: engine.ScrollMode.Off }
      });
      instance.current = api;
      api.metronomeVolume = 0;
      api.countInVolume = 0;
      api.error.on((e) => setError(String(e)));
      api.playerReady.on(() => { if (!disposed) { api.playbackSpeed = latestScoreSpeed.current; setReady(true); } });
      let seekFrame = 0;
      api.playerPositionChanged.on(event => {
        if (disposed) return;
        setScorePosition({ time: event.currentTime, end: event.endTime });
        const endTick = api.tickCache?.masterBars.at(-1)?.end;
        setScoreAtEnd(endTick !== undefined && event.currentTick >= endTick);
        if (event.isSeek && displayState.current.follow) {
          cancelAnimationFrame(seekFrame);
          seekFrame = requestAnimationFrame(() => {
            if (!disposed && api.playerState !== 1 && displayState.current.follow) alignScoreCursor(api);
          });
        }
      });
      api.postRenderFinished.on(() => {
        if (disposed) return;
        const display = displayState.current;
        // Include enough trailing paper for the final beat to reach the cursor.
        api.uiFacade.setCanvasOverflow(api.canvasElement,
          display.viewMode === "scrolling" && viewport.current ? viewport.current.clientWidth - display.cursorAnchor : 0, false);
        if (display.follow) {
          alignScoreCursor(api);
          api.tickPosition = api.tickPosition;
        }
      });
      api.playerStateChanged.on((e) => {
        setPlaying(e.state === 1);
        if (e.state === 1) { setWrittenCursor(true); setError(""); performance.current?.pause(); latestPerformance.current.onBeforePlay(); }
      });
      api.beatMouseDown.on(() => {
        setWrittenCursor(true);
        performance.current?.pause();
        latestPerformance.current.onBeforePlay();
      });
      api.scoreLoaded.on((score) => {
        setScoreVersion(version => version + 1);
        setPlayableTracks(score.tracks.filter(track => track.staves.some(staff => staff.bars.some(bar =>
          bar.voices.some(voice => voice.beats.some(beat => !beat.isRest && beat.notes.length > 0))
        ))).map(track => track.index + 1));
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
      // Use the supported output interface, so both score and detected-timing
      // playback share live amp settings without patching browser audio globals.
      api.uiFacade.createWorkerPlayer = () => createTonePlayer(engine, () => {
        if (!disposed) setError("Audio could not start. Tap Play to retry.");
      });
      api.settings.player.playerMode = engine.PlayerMode.EnabledSynthesizer;
      api.updateSettings();
      api.loadSoundFontFromUrl(GUITAR_SOUNDFONT, false);
      api.load(new TextEncoder().encode(latestXml.current), hasTwoTracks ? [0,1] : [0]);
      // A separate synth keeps the performance clock out of the engraved score's
      // tempo/beat lookup. Its player never shows a falsely aligned score cursor.
      const raw = createTonePlayer(engine, () => {
        if (!disposed) setPerformanceError("Audio could not start. Tap Play to retry.");
      });
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
    try { raw.loadMidiFile(buildPerformanceMidi(engineRef.current, playbackNotes, duration)); }
    catch { setPerformanceError("Detected timing playback is unavailable."); }
  }, [playbackNotes, duration]);

  useEffect(() => {
    if (performance.current) performance.current.playbackSpeed = playbackSpeed;
    if (instance.current) instance.current.playbackSpeed = playbackSpeed;
    setScoreSpeed(playbackSpeed);
  }, [playbackSpeed]);
  useEffect(() => { setWrittenCursor(false); performance.current?.pause(); pauseScore(instance.current); }, [audioPlayToken]);
  useEffect(() => { setWrittenCursor(false); performance.current?.stop(); instance.current?.stop(); }, [revision]);

  useEffect(() => {
    const api = instance.current;
    const engine = engineRef.current;
    if (!api || !engine || !viewport.current) return;
    const layout = viewMode === "scrolling" ? engine.LayoutMode.Horizontal : engine.LayoutMode.Page;
    const leftPadding = viewMode === "scrolling" ? cursorAnchor + 16 : 35;
    const needsRender = api.settings.display.layoutMode !== layout || api.settings.display.padding[0] !== leftPadding;
    api.settings.display.layoutMode = layout;
    api.settings.display.padding = [leftPadding, 24, 35, 24];
    api.settings.player.scrollElement = viewport.current;
    api.settings.player.scrollMode = !follow ? engine.ScrollMode.Off
      : viewMode === "scrolling" && !reducedMotion ? engine.ScrollMode.Smooth : engine.ScrollMode.OffScreen;
    api.settings.player.scrollOffsetX = -cursorAnchor;
    api.settings.player.scrollOffsetY = 0;
    api.settings.player.scrollSpeed = reducedMotion ? 0 : 180;
    api.settings.player.nativeBrowserSmoothScroll = false;
    api.settings.player.enableAnimatedBeatCursor = !reducedMotion;
    api.updateSettings();
    api.uiFacade.setCanvasOverflow(api.canvasElement, viewMode === "scrolling" ? viewport.current.clientWidth - cursorAnchor : 0, false);
    if (needsRender) api.render();
    else if (follow && api.score) {
      alignScoreCursor(api);
      api.tickPosition = api.tickPosition;
    }
  }, [viewMode, follow, reducedMotion, cursorAnchor, scoreVersion]);

  function playDetectedTiming() {
    const raw = performance.current;
    if (!raw?.isReadyForPlayback || !canPlayDetected) return;
    if (performancePlaying) { raw.pause(); return; }
    setWrittenCursor(false);
    setPerformanceError("");
    pauseScore(instance.current); onBeforePlay();
    raw.tickPosition = Math.round(Math.min(audioPosition, Math.max(0, duration - .01)) * PERFORMANCE_TICKS_PER_SECOND);
    raw.playbackSpeed = playbackSpeed;
    if (!raw.play()) setPerformanceError("Detected timing playback is unavailable.");
  }

  useEffect(() => {
    const api = instance.current;
    if (!api) return;
    api.stop();
    setWrittenCursor(false);
    setReady(false); setPlayableTracks([]); setScorePosition({ time: 0, end: 0 }); setScoreAtEnd(false);
    setError("");
    api.load(new TextEncoder().encode(musicxml), hasTwoTracks ? [0,1] : [0]);
  }, [musicxml, hasTwoTracks]);

  useEffect(() => {
    const api = instance.current;
    if (!api?.score) return;
    pauseScore(api);
    const tracks = api.score.tracks;
    const shown = activeTrack ? tracks.filter(track => track.index === activeTrack - 1) : tracks;
    api.changeTrackSolo(tracks, false);
    if (activeTrack) api.changeTrackSolo(shown, true);
    api.renderTracks(shown);
  }, [activeTrack, scoreVersion]);

  useEffect(() => {
    const api = instance.current;
    if (!api?.score) return;
    api.score.subTitle = betaCopy.current.subtitle;
    api.score.notices = betaCopy.current.notice;
    api.score.instructions = betaCopy.current.notice;
    api.render();
  }, [t]);

  function playScore() {
    const api = instance.current;
    if (!api || !canPlayScore) return;
    if (playing) { pauseScore(api); return; }
    setWrittenCursor(true);
    if (!api.play()) setError("Audio could not start. Tap Play to retry.");
  }

  function seekScore(time: number) {
    const api = instance.current;
    if (!api || !canPlayScore) return;
    setWrittenCursor(true);
    performance.current?.pause(); onBeforePlay();
    api.timePosition = time;
  }

  function browseScore() {
    if (displayState.current.follow) setFollow(false);
  }

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
    {hasTwoTracks && <label className="notation-track-picker">{t("Guitar track")}<select aria-label={t("Score and playback track")} value={activeTrack} onChange={event => setSoloTrack(Number(event.target.value))}>
      <option value="0">{t("Both guitars")}</option>{[1,2].map(track => <option key={track} value={track}>{t("Guitar {number}", { number: track })}</option>)}
    </select><small>{t("Choose a guitar to view and hear it alone. File exports keep both tracks.")}</small></label>}
    <div className="notation-toolbar">
      <div className="notation-view-switch" role="group" aria-label={t("Score layout")}>
        <button aria-pressed={viewMode === "page"} onClick={() => setViewMode("page")}>{t("Page")}</button>
        <button aria-pressed={viewMode === "scrolling"} onClick={() => setViewMode("scrolling")}>{t("Scrolling score")}</button>
      </div>
      <button className="notation-follow" aria-pressed={follow} onClick={() => setFollow(value => !value)}>{t(follow ? "Following playhead" : "Follow playhead")}</button>
    </div>
    <div className="notation-transport">
      <button className="notation-play" disabled={!canPlayScore} onClick={playScore}>{playing ? t("Pause score playback") : ready ? t("Play score") : t("Loading score sounds…")}</button>
      <input className="notation-seek" type="range" min="0" max={Math.max(1, scorePosition.end)} step="1" value={Math.min(scorePosition.time, scorePosition.end)}
        disabled={!canPlayScore || !scorePosition.end} aria-label={t("Written score position")} aria-valuetext={`${seconds(scorePosition.time / 1000)} / ${seconds(scorePosition.end / 1000)}`}
        onChange={event => seekScore(Number(event.target.value))} />
      <small className="notation-time">{seconds(scorePosition.time / 1000)} / {seconds(scorePosition.end / 1000)}</small>
      <select className="notation-speed" aria-label={t("Score playback speed")} value={scoreSpeed} onChange={event => {
        const speed = Number(event.target.value); setScoreSpeed(speed); if (instance.current) instance.current.playbackSpeed = speed;
      }}>{[.5, .75, 1].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select>
    </div>
    <small className="notation-timing-note">{t("Follows the written rhythm · synthesized guitar")}</small>
    {scoreVersion > 0 && !playableTracks.some(track => !activeTrack || track === activeTrack) && <p className="notation-empty" role="status">{t("No playable notes in this score. Review the notes or adjust the score offset.")}</p>}
    {error && <p role="alert">{t("Score unavailable: {error}", { error: localize(error) })}</p>}
    <div className={`notation-stage${viewMode === "scrolling" ? " is-scrolling" : ""}${writtenCursor ? " is-written-cursor" : ""}${scoreAtEnd ? " is-score-end" : ""}${viewMode === "scrolling" && follow && !reducedMotion && canPlayScore && writtenCursor ? " is-following" : ""}`}
      style={{ "--score-cursor-x": `${cursorAnchor}px` } as CSSProperties}>
      <div className="notation-viewport" ref={viewport} tabIndex={0} role="region" aria-label={t("Guitar score")}
        onWheel={event => { if (Math.abs(event.deltaX) > 1 || event.shiftKey) browseScore(); }}
        onTouchStart={event => { const touch = event.touches[0]; if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
        onTouchMove={event => {
          const touch = event.touches[0]; const start = touchStart.current;
          if (touch && start && Math.abs(touch.clientX - start.x) > Math.max(8, Math.abs(touch.clientY - start.y))) browseScore();
        }}
        onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(event.key)) browseScore(); }}>
        <div className="notation-paper" ref={host} />
      </div>
      <div className="notation-fixed-cursor" aria-hidden="true" />
    </div>
    <div className="notation-secondary transcription-actions">
      <button disabled={!canPlayDetected || !performanceReady || Boolean(performanceError && performanceError !== "Audio could not start. Tap Play to retry.")} onClick={playDetectedTiming}>{t(performancePlaying ? "Stop detected timing" : "Play detected timing")}</button>
      <small aria-label={t("Detected timing position")}>{seconds(performanceTime)}</small>
      <button onClick={() => instance.current?.print("210mm", { display: { layoutMode: "page", padding: [35, 35] } })}>{t("Print / Save as PDF (Beta)")}</button>
      <button onClick={() => void guitarPro()}>{t("Export Guitar Pro (Beta)")}</button>
    </div>
    <small>{t("Detected timing starts at the audio playhead and preserves estimated picking intervals and sustains. Score playback follows the written rhythm. Neither guarantees correct notes or playing dynamics.")}</small>
    {performanceError && <p role="alert">{t(performanceError)}</p>}
    <small className="notation-credit">{t("Engraved with")} <a href="https://alphatab.net" target="_blank" rel="noreferrer">alphaTab</a> · MPL-2.0</small>
  </section>;
}
