import type { synth } from "@coderline/alphatab";
import { resumeAudioPlayback } from "./audio-playback";
import { attachToneRig } from "./tone-store";

type Engine = typeof import("@coderline/alphatab");

class Signal<Args extends unknown[]> {
  private listeners = new Set<(...args: Args) => void>();
  on(listener: (...args: Args) => void) { this.listeners.add(listener); return () => this.off(listener); }
  off(listener: (...args: Args) => void) { this.listeners.delete(listener); }
  emit(...args: Args) { for (const listener of [...this.listeners]) listener(...args); }
}

type Chunk = {
  buffer: AudioBuffer;
  consumed: number;
  scheduledOffset: number;
  start: number | null;
  source: AudioBufferSourceNode | null;
};

/**
 * Public alphaSynth output contract. Scheduling PCM with standard Web Audio
 * nodes keeps the official guitar samples and MIDI clock, while owning the
 * destination lets every synthesized note pass through the live tone rig.
 */
export class ToneSynthOutput implements synth.ISynthOutput {
  readonly ready = new Signal<[]>();
  readonly samplesPlayed = new Signal<[number]>();
  readonly sampleRequest = new Signal<[]>();
  private chunks: Chunk[] = [];
  private rig: ReturnType<typeof attachToneRig> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private playing = false;
  private destroyed = false;
  private bufferSeconds = .12;
  private nextStart = 0;
  private generation = 0;
  private activation = 0;

  constructor(private context: AudioContext, private onBlocked?: () => void) {}
  get sampleRate() { return this.context.sampleRate; }

  open(bufferTimeInMilliseconds: number) {
    // One synth block is 2048 stereo frames (about 46 ms at 44.1 kHz).
    // Keep at most the requested horizon plus one block scheduled ahead.
    this.bufferSeconds = Math.max(.08, Math.min(.2, bufferTimeInMilliseconds / 1000 || .12));
    this.ready.emit();
  }

  activate() {
    if (this.destroyed) return;
    const activation = ++this.activation;
    void resumeAudioPlayback(this.context).then(resumed => {
      if (!resumed && !this.destroyed && this.playing && activation === this.activation) {
        this.pause();
        this.onBlocked?.();
      }
    });
  }

  play() {
    if (this.destroyed || this.playing) return;
    this.playing = true;
    this.nextStart = this.context.currentTime + .012;
    for (const chunk of this.chunks) this.schedule(chunk);
    this.pump();
    if (this.playing) this.timer = setInterval(() => this.pump(), 20);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.generation++;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.reportPlayed();
    // Preserve unread PCM: alphaSynth has already advanced its synthesizer
    // into these samples. Discarding them here would skip notes on resume.
    this.unschedule();
    this.clearRig();
  }

  resetSamples() {
    // alphaSynth has already set its new clock when seeking. Do not report
    // any samples from the old position into that new clock.
    this.generation++;
    this.unschedule();
    this.chunks = [];
    this.nextStart = this.context.currentTime + .012;
    this.clearRig();
  }

  addSamples(samples: Float32Array) {
    if (this.destroyed || samples.length < 2) return;
    const frames = Math.floor(samples.length / 2);
    const buffer = this.context.createBuffer(2, frames, this.sampleRate);
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    for (let frame = 0; frame < frames; frame++) {
      left[frame] = samples[frame * 2];
      right[frame] = samples[frame * 2 + 1];
    }
    const chunk: Chunk = { buffer, consumed: 0, scheduledOffset: 0, start: null, source: null };
    this.chunks.push(chunk);
    if (this.playing) this.schedule(chunk);
  }

  private schedule(chunk: Chunk) {
    this.rig ??= attachToneRig(this.context);
    const source = this.context.createBufferSource();
    source.buffer = chunk.buffer;
    source.connect(this.rig.input);
    chunk.source = source;
    chunk.scheduledOffset = chunk.consumed;
    // A delayed main-thread timer can leave a gap; count only real samples,
    // never that gap, toward the score/performance clock.
    chunk.start = Math.max(this.nextStart, this.context.currentTime + .004);
    this.nextStart = chunk.start + (chunk.buffer.length - chunk.consumed) / this.sampleRate;
    source.start(chunk.start, chunk.consumed / this.sampleRate);
  }

  private reportPlayed() {
    const now = this.context.currentTime;
    let framesPlayed = 0;
    for (const chunk of this.chunks) {
      if (chunk.start === null || now <= chunk.start) continue;
      const consumed = Math.min(chunk.buffer.length, chunk.scheduledOffset + Math.floor((now - chunk.start) * this.sampleRate + 1e-6));
      framesPlayed += Math.max(0, consumed - chunk.consumed);
      chunk.consumed = consumed;
    }
    this.chunks = this.chunks.filter(chunk => {
      if (chunk.consumed < chunk.buffer.length) return true;
      chunk.source?.disconnect();
      return false;
    });
    // Listeners can seek, loop, pause or destroy this output synchronously.
    if (framesPlayed > 0) this.samplesPlayed.emit(framesPlayed);
  }

  private pump() {
    if (!this.playing || this.destroyed) return;
    const generation = this.generation;
    this.reportPlayed();
    if (!this.playing || this.destroyed || generation !== this.generation) return;
    // sampleRequest is synchronous for the public AlphaSynth used below.
    // Bound requests even if a finished synth returns an empty/short block.
    for (let requests = 0; requests < 8; requests++) {
      const buffered = this.chunks.reduce((frames, chunk) => frames + chunk.buffer.length - chunk.consumed, 0);
      if (buffered >= this.sampleRate * this.bufferSeconds) break;
      const count = this.chunks.length;
      this.sampleRequest.emit();
      if (!this.playing || this.destroyed || generation !== this.generation || this.chunks.length === count) break;
    }
  }

  private unschedule() {
    for (const chunk of this.chunks) {
      if (chunk.source) {
        try { chunk.source.stop(); } catch { /* The scheduled buffer may already have ended. */ }
        chunk.source.disconnect();
      }
      chunk.source = null;
      chunk.start = null;
    }
  }

  private clearRig() { this.rig?.dispose(); this.rig = null; }

  destroy() {
    if (this.destroyed) return;
    this.pause();
    this.destroyed = true;
    this.activation++;
    this.resetSamples();
    void this.context.close().catch(() => { /* A closed context is already disposed. */ });
  }

  // The app uses the system output and has no device picker. Do not request
  // microphone permission just to enumerate output devices.
  async enumerateOutputDevices(): Promise<synth.ISynthOutputDevice[]> { return []; }
  async getOutputDevice(): Promise<synth.ISynthOutputDevice | null> { return null; }
  async setOutputDevice(device: synth.ISynthOutputDevice | null) {
    if (device !== null) throw new Error("Custom output devices are not available.");
  }
}

export function createTonePlayer(engine: Engine, onBlocked?: () => void): synth.IAlphaSynth {
  const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) throw new Error("Audio playback is unavailable.");
  // AlphaSynth reads sampleRate before calling output.open(), so create the
  // actual context first; a guessed 44.1 kHz would detune 48 kHz devices.
  let player: synth.IAlphaSynth | undefined;
  const output = new ToneSynthOutput(new Audio(), () => { player?.pause(); onBlocked?.(); });
  try { player = new engine.synth.AlphaSynth(output, 120); }
  catch (error) { output.destroy(); throw error; }
  return player;
}
