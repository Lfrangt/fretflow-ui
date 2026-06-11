import { chordMarkers, markerMidi, midiToFrequency } from "@/lib/chords";

// Single warm-clean voice: triangle pluck + sine body an octave below,
// through a gentle low-pass. Strummed with an 18ms roll between strings.
const TONE = { oscillator: "triangle" as OscillatorType, filter: 1400, gain: 0.075, decay: 1.6, detune: 0 };

let context: AudioContext | null = null;
let unlocked = false;

type WebAudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function getContext() {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

export async function unlockAudio() {
  const ctx = getContext();
  if (!ctx || ctx.state === "closed") return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  if (!unlocked && ctx.state === "running") {
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    gain.gain.setValueAtTime(0.00001, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.01);
    unlocked = true;
  }
  return ctx;
}

export async function strumChord(chord: string) {
  const ctx = await unlockAudio();
  if (!ctx || ctx.state !== "running") return;

  const now = ctx.currentTime + 0.02;
  chordMarkers(chord).forEach((marker, index) => {
    const start = now + index * 0.018;
    const frequency = midiToFrequency(markerMidi(marker));

    const pluck = ctx.createOscillator();
    const body = ctx.createOscillator();
    const pluckGain = ctx.createGain();
    const bodyGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    pluck.type = TONE.oscillator;
    pluck.frequency.setValueAtTime(frequency, start);
    pluck.detune.setValueAtTime(TONE.detune, start);
    body.type = "sine";
    body.frequency.setValueAtTime(frequency * 0.5, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(TONE.filter, start);
    filter.Q.setValueAtTime(0.75, start);

    pluckGain.gain.setValueAtTime(0.0001, start);
    pluckGain.gain.exponentialRampToValueAtTime(TONE.gain, start + 0.025);
    pluckGain.gain.exponentialRampToValueAtTime(0.0001, start + TONE.decay);
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(TONE.gain * 0.22, start + 0.03);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + TONE.decay * 0.9);

    pluck.connect(filter);
    filter.connect(pluckGain);
    pluckGain.connect(ctx.destination);
    body.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    pluck.start(start);
    body.start(start);
    pluck.stop(start + TONE.decay + 0.05);
    body.stop(start + TONE.decay + 0.05);
  });
}
