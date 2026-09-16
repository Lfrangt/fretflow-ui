"use client";

import { useEffect, useRef, useState } from "react";
import type { synth } from "@coderline/alphatab";
import { loadNotationEngine } from "@/lib/notation-engine";
import { buildPerformanceMidi, PERFORMANCE_TICKS_PER_SECOND } from "@/lib/performance-midi";
import { chordAtTime, soundingMidi, type PracticePerformance } from "@/lib/practice-performance";
import { prepareAudioPlayback } from "@/lib/audio-playback";
import { createTonePlayer } from "@/lib/tone-synth";

export function usePracticePerformance(data: PracticePerformance | null, options: {
  playing: boolean; enabled: boolean; audible: boolean; bpm: number;
  loop: "full" | "pair" | "hold"; loopStart: number;
  onChord: (index: number) => void; onNotes: (midis: number[]) => void; onError: () => void;
}) {
  const player = useRef<synth.IAlphaSynth | null>(null);
  const position = useRef(0);
  const startedFromGesture = useRef(false);
  const latest = useRef(options); latest.current = options;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setReady(false); setError(false);
    if (!data?.notes.length) return;
    position.current = 0;
    let disposed = false;
    const abort = new AbortController();
    // The official synth keeps the guitar samples and MIDI timing; our public
    // output adapter routes those samples through the shared amp/effects graph.
    const host = document.createElement("div");
    host.hidden = true; document.body.append(host);
    let api: import("@coderline/alphatab").AlphaTabApi | undefined;
    const fail = () => { if (!disposed) { setError(true); if (latest.current.enabled) latest.current.onError(); } };
    void loadNotationEngine().then(engine => {
      if (disposed) return;
      api = new engine.AlphaTabApi(host, {
        core: { scriptFile: new URL("/alphatab/alphaTab.min.js", location.href).href, fontDirectory: "/alphatab/font/", useWorkers: false },
        player: { playerMode: "disabled" }
      });
      const raw = createTonePlayer(engine, fail);
      if (!raw) throw new Error("No performance output");
      player.current = raw;
      raw.metronomeVolume = 0; raw.countInVolume = 0; raw.isLooping = true;
      raw.readyForPlayback.on(() => { if (!disposed) { raw.tickPosition = Math.round(position.current * PERFORMANCE_TICKS_PER_SECOND); setReady(true); } });
      raw.positionChanged.on(event => {
        if (disposed || !latest.current.enabled) return;
        // currentTime stretches with playbackSpeed; MIDI ticks stay on the source timeline.
        position.current = event.currentTick / PERFORMANCE_TICKS_PER_SECOND;
        latest.current.onNotes(soundingMidi(data, position.current));
        const index = chordAtTime(data, position.current);
        if (index >= 0) latest.current.onChord(index);
      });
      raw.midiLoadFailed.on(fail); raw.soundFontLoadFailed.on(fail);
      let initialized = false;
      const initialize = () => {
        if (disposed || initialized) return;
        initialized = true;
        raw.loadMidiFile(buildPerformanceMidi(engine, data.notes, data.duration));
        void fetch("/soundfonts/freepats-classical-guitar.sf2", { signal: abort.signal }).then(async response => {
          if (!response.ok) throw new Error("No guitar samples");
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!disposed) raw.loadSoundFont(bytes, false);
        }).catch(fail);
      };
      raw.ready.on(initialize); if (raw.isReady) initialize();
    }).catch(fail);
    return () => {
      disposed = true; abort.abort(); player.current?.destroy(); player.current = null;
      api?.destroy(); host.remove();
    };
  }, [data]);

  useEffect(() => {
    const raw = player.current;
    if (!raw || !data || !ready) return;
    raw.playbackSpeed = options.bpm / data.bpm;
    raw.masterVolume = options.audible ? 1 : 0;
  }, [data, ready, options.bpm, options.audible]);

  useEffect(() => {
    const raw = player.current;
    if (!raw || !data || !ready) return;
    const start = data.chords[options.loopStart]?.start ?? 0;
    const end = data.chords[Math.min(data.chords.length - 1, options.loopStart + (options.loop === "pair" ? 1 : 0))]?.end ?? data.duration;
    raw.playbackRange = options.loop === "full" ? null : { startTick: Math.round(start * 1920), endTick: Math.round(end * 1920) };
  }, [data, ready, options.loop, options.loopStart]);

  useEffect(() => {
    const raw = player.current;
    if (!raw || !ready) return;
    if (options.enabled && options.playing) {
      if (!startedFromGesture.current && !raw.play()) { setError(true); if (latest.current.enabled) latest.current.onError(); }
    } else raw.pause();
    startedFromGesture.current = false;
  }, [ready, options.enabled, options.playing]);

  function seekTime(time: number) {
    if (!data) return;
    position.current = Math.max(0, Math.min(time, data.duration - .001));
    if (player.current?.isReadyForPlayback) player.current.tickPosition = Math.round(position.current * PERFORMANCE_TICKS_PER_SECOND);
    latest.current.onNotes(soundingMidi(data, position.current));
  }
  function playFromGesture() {
    prepareAudioPlayback();
    const raw = player.current;
    if (!raw || !ready) return false;
    raw.masterVolume = latest.current.audible ? 1 : 0;
    const started = raw.play();
    startedFromGesture.current = started;
    setError(!started);
    if (!started) latest.current.onError();
    return started;
  }
  return { ready, error, playFromGesture, getTime: () => position.current, pauseNow: () => player.current?.pause(), seekTime,
    seekChord(index: number) { seekTime(data?.chords[index]?.start ?? 0); }
  };
}
