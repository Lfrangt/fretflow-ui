"use client";

import { useEffect, useRef, useState } from "react";
import { chordAtTime, practiceRange, type PracticePerformance } from "@/lib/practice-performance";
import { prepareAudioPlayback } from "@/lib/audio-playback";

/** Play the actual source, with the chord guide following its media clock. */
export function usePracticeRecording(data: PracticePerformance | null, options: {
  playing: boolean; enabled: boolean; audible: boolean; bpm: number;
  loop: "full" | "pair" | "hold"; loopStart: number;
  onChord: (index: number) => void; onError: () => void;
}) {
  const player = useRef<HTMLAudioElement | null>(null);
  const pendingPosition = useRef(0);
  const latest = useRef(options); latest.current = options;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setReady(false); setError(false);
    if (!data?.originalUrl) return;
    pendingPosition.current = data.offset;
    let disposed = false, frame = 0;
    const audio = document.createElement("audio");
    audio.hidden = true; audio.dataset.practiceRecording = "true";
    audio.preload = "auto"; audio.preservesPitch = true;
    document.body.append(audio); player.current = audio;
    const fail = () => { if (!disposed) { setError(true); if (latest.current.enabled) latest.current.onError(); } };
    const play = () => { void audio.play().catch(error => { if (error.name !== "AbortError" && latest.current.enabled && latest.current.playing) fail(); }); };
    const update = () => {
      if (!latest.current.enabled || audio.readyState < 1) return;
      const range = practiceRange(data, latest.current.loop, latest.current.loopStart);
      let time = audio.currentTime - data.offset;
      if (latest.current.playing && (time >= range.end || audio.ended)) {
        audio.currentTime = data.offset + range.start; time = range.start;
        if (audio.paused) play();
      }
      const index = chordAtTime(data, time);
      if (index >= 0) latest.current.onChord(index);
    };
    const tick = () => { update(); frame = requestAnimationFrame(tick); };
    audio.addEventListener("loadedmetadata", () => { audio.currentTime = pendingPosition.current; });
    audio.addEventListener("canplay", () => { if (!disposed) setReady(true); });
    audio.addEventListener("error", fail);
    audio.addEventListener("timeupdate", update); audio.addEventListener("seeked", update); audio.addEventListener("ended", update);
    audio.src = data.originalUrl;
    frame = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(frame); audio.pause(); audio.removeAttribute("src"); audio.load(); audio.remove(); player.current = null; };
  }, [data]);

  useEffect(() => {
    const audio = player.current;
    if (!audio || !data) return;
    audio.muted = !options.audible;
    audio.playbackRate = Math.max(.25, Math.min(4, options.bpm / data.bpm));
  }, [data, options.audible, options.bpm]);

  useEffect(() => {
    const audio = player.current;
    if (!audio || !data || !ready) return;
    const range = practiceRange(data, options.loop, options.loopStart);
    const position = audio.currentTime - data.offset;
    if (position < range.start || position >= range.end) audio.currentTime = data.offset + range.start;
  }, [data, ready, options.loop, options.loopStart]);

  useEffect(() => {
    const audio = player.current;
    if (!audio || !ready) return;
    if (options.enabled && options.playing) {
      void audio.play().catch(error => {
        if (error.name !== "AbortError" && latest.current.enabled && latest.current.playing) { setError(true); if (latest.current.enabled) latest.current.onError(); }
      });
    } else audio.pause();
  }, [ready, options.enabled, options.playing]);

  function seekTime(time: number) {
    if (data) {
      pendingPosition.current = data.offset + Math.max(0, Math.min(time, data.duration - .001));
      if (player.current && player.current.readyState >= 1) player.current.currentTime = pendingPosition.current;
    }
  }
  function playFromGesture() {
    const audio = player.current;
    if (!audio || !ready) return false;
    prepareAudioPlayback();
    audio.muted = !latest.current.audible;
    setError(false);
    void audio.play().catch(error => {
      if (error.name !== "AbortError" && latest.current.enabled) { setError(true); latest.current.onError(); }
    });
    return true;
  }
  return { ready, error, playFromGesture, pauseNow: () => player.current?.pause(), seekTime,
    getTime: () => Math.max(0, (player.current?.readyState ? player.current.currentTime : pendingPosition.current) - (data?.offset ?? 0)),
    seekChord(index: number) { seekTime(data?.chords[index]?.start ?? 0); }
  };
}
