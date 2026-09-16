export type AmpType = "clean" | "crunch" | "lead";
export type CabinetType = "open" | "stack";

/** Knobs use 0–100; delayTime uses milliseconds. EQ 50 is neutral. */
export type ToneRigSettings = {
  enabled: boolean;
  amp: AmpType;
  cabinet: CabinetType;
  gain: number;
  volume: number;
  bass: number;
  middle: number;
  treble: number;
  presence: number;
  boost: number;
  chorus: number;
  delay: number;
  reverb: number;
  boostEnabled: boolean;
  chorusEnabled: boolean;
  delayEnabled: boolean;
  reverbEnabled: boolean;
  delayTime: number;
};

export const DEFAULT_TONE_RIG: ToneRigSettings = {
  enabled: true, amp: "clean", cabinet: "open", gain: 28, volume: 72,
  bass: 48, middle: 52, treble: 58, presence: 52,
  boost: 20, chorus: 25, delay: 24, reverb: 18,
  boostEnabled: false, chorusEnabled: false, delayEnabled: false, reverbEnabled: true,
  delayTime: 320,
};

/** Authored starting points for our synth/sample voices, not BOSS hardware models. */
export const TONE_RIG_PRESETS: { id: string; name: string; settings: ToneRigSettings }[] = [
  { id: "bright-clean", name: "Bright Clean", settings: { ...DEFAULT_TONE_RIG } },
  { id: "warm-jazz", name: "Warm Jazz", settings: {
    ...DEFAULT_TONE_RIG, gain: 20, bass: 58, middle: 60, treble: 35, presence: 32, reverb: 22,
  } },
  { id: "edge-of-breakup", name: "Edge of Breakup", settings: {
    ...DEFAULT_TONE_RIG, amp: "crunch", gain: 24, bass: 46, middle: 58, treble: 56, presence: 55,
    boostEnabled: true, boost: 12, reverb: 16,
  } },
  { id: "classic-crunch", name: "Classic Crunch", settings: {
    ...DEFAULT_TONE_RIG, amp: "crunch", cabinet: "stack", gain: 52, bass: 54, middle: 60,
    treble: 48, presence: 46, boostEnabled: true, boost: 25, reverb: 14,
  } },
  { id: "singing-lead", name: "Singing Lead", settings: {
    ...DEFAULT_TONE_RIG, amp: "lead", cabinet: "stack", gain: 60, bass: 44, middle: 66,
    treble: 52, presence: 54, boostEnabled: true, boost: 20,
    delayEnabled: true, delay: 28, delayTime: 360, reverb: 24,
  } },
  { id: "dreamy-ambient", name: "Dreamy Ambient", settings: {
    ...DEFAULT_TONE_RIG, gain: 24, bass: 46, middle: 50, treble: 60, presence: 48,
    chorusEnabled: true, chorus: 50, delayEnabled: true, delay: 48, delayTime: 520, reverb: 62,
  } },
];

const knobKeys = ["gain", "volume", "bass", "middle", "treble", "presence", "boost", "chorus", "delay", "reverb"] as const;
const switchKeys = ["enabled", "boostEnabled", "chorusEnabled", "delayEnabled", "reverbEnabled"] as const;

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** Persistence is untrusted. Legacy 0–10 data must be explicitly migrated by its caller. */
export function normalizeToneRig(value: unknown): ToneRigSettings {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const settings = { ...DEFAULT_TONE_RIG };
  for (const key of knobKeys) settings[key] = boundedNumber(source[key], settings[key], 0, 100);
  for (const key of switchKeys) if (typeof source[key] === "boolean") settings[key] = source[key];
  if (source.amp === "clean" || source.amp === "crunch" || source.amp === "lead") settings.amp = source.amp;
  if (source.cabinet === "open" || source.cabinet === "stack") settings.cabinet = source.cabinet;
  settings.delayTime = boundedNumber(source.delayTime, settings.delayTime, 80, 800);
  return settings;
}

// Fixed curves let drive changes use smooth AudioParams instead of reallocating curves.
const driveCurve = new Float32Array(4096);
const ceilingCurve = new Float32Array(4096);
for (let i = 0; i < driveCurve.length; i++) {
  const x = i * 2 / (driveCurve.length - 1) - 1;
  driveCurve[i] = Math.tanh(x * 2) / Math.tanh(2);
  ceilingCurve[i] = Math.max(-.94, Math.min(.94, x));
}

function roomImpulse(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * 1.6), context.sampleRate);
  let seed = 173;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let filtered = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      filtered = filtered * .35 + (seed / 2147483647 * 2 - 1) * .65;
      data[i] = filtered * Math.exp(-i / context.sampleRate * 4.6);
    }
    // A few early reflections give the synthetic room a defined attack.
    for (const [seconds, level] of [[.014, .6], [.031, .4], [.047, .25]]) {
      data[Math.round((seconds + channel * .002) * context.sampleRate)] += level;
    }
  }
  return buffer;
}

/**
 * One persistent rig per audio context. Connect musical voices to input.
 * Volume applies in both active and bypass modes, with zero as a true mute.
 * Bypass skips amp/EQ/cabinet/effects; the output safety limiter remains active.
 * This never resumes a context; the caller owns the browser's user-gesture unlock.
 */
export function createToneRig(
  context: BaseAudioContext,
  initialSettings: ToneRigSettings,
  destination: AudioNode = context.destination,
): { input: GainNode; update: (settings: ToneRigSettings) => void; dispose: () => void } {
  const nodes: AudioNode[] = [];
  const own = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
  const gain = () => own(context.createGain());
  const filter = (type: BiquadFilterType, frequency: number, q = .707) => {
    const node = own(context.createBiquadFilter());
    node.type = type; node.frequency.value = frequency; node.Q.value = q;
    return node;
  };
  const input = gain();
  const bypass = gain();
  const processedInput = gain();
  const processed = gain();
  const master = gain();
  const lowCut = filter("highpass", 65);
  const boostColor = filter("peaking", 1050, .8);
  const preamp = gain();
  const drive = own(context.createWaveShaper());
  drive.curve = driveCurve; drive.oversample = "2x";
  const ampLevel = gain();
  const bass = filter("lowshelf", 150);
  const middle = filter("peaking", 750, .75);
  const treble = filter("highshelf", 2200);
  const presence = filter("highshelf", 3500);
  const cabinetBody = filter("peaking", 120, .8);
  const cabinetTop = filter("lowpass", 7200);
  const chorusDry = gain();
  const chorusDelay = own(context.createDelay(.1));
  chorusDelay.delayTime.value = .018;
  const chorusWet = gain();
  const chorusDepth = gain();
  const lfo = own(context.createOscillator());
  lfo.type = "sine"; lfo.frequency.value = .8;
  const effects = gain();
  const delaySend = gain();
  const delay = own(context.createDelay(1));
  const delayFeedback = gain();
  const delayTone = filter("lowpass", 3200);
  const delayWet = gain();
  const mixed = gain();
  const reverbSend = gain();
  const room = own(context.createConvolver());
  room.normalize = true;
  room.buffer = roomImpulse(context);
  const reverbWet = gain();
  const limiter = own(context.createDynamicsCompressor());
  limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20;
  limiter.attack.value = .003; limiter.release.value = .18;
  // A compressor alone allows attack transients through. This bounds the final samples.
  const ceiling = own(context.createWaveShaper());
  ceiling.curve = ceilingCurve;

  input.connect(bypass).connect(master);
  input.connect(processedInput).connect(lowCut).connect(boostColor).connect(preamp).connect(drive).connect(ampLevel)
    .connect(bass).connect(middle).connect(treble).connect(presence).connect(cabinetBody).connect(cabinetTop);
  cabinetTop.connect(chorusDry).connect(effects);
  cabinetTop.connect(chorusDelay).connect(chorusWet).connect(effects);
  lfo.connect(chorusDepth).connect(chorusDelay.delayTime);
  effects.connect(mixed);
  effects.connect(delaySend).connect(delay).connect(delayWet).connect(mixed);
  delay.connect(delayFeedback).connect(delayTone).connect(delay);
  mixed.connect(processed);
  mixed.connect(reverbSend).connect(room).connect(reverbWet).connect(processed);
  processed.connect(master);
  master.connect(limiter).connect(ceiling).connect(destination);

  let disposed = false;
  let initializing = true;
  const smooth = (param: AudioParam, value: number, time = .018) => {
    if (initializing) { param.value = value; return; }
    const now = context.currentTime;
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
    else { const current = param.value; param.cancelScheduledValues(now); param.setValueAtTime(current, now); }
    param.setTargetAtTime(value, now, time);
  };
  const update = (next: ToneRigSettings) => {
    if (disposed) return;
    const settings = normalizeToneRig(next);
    const amount = settings.gain / 100;
    const boost = settings.boostEnabled ? settings.boost / 100 : 0;
    const driveAmount = settings.amp === "clean" ? .7 + amount * 1.5
      : settings.amp === "crunch" ? 1 + amount ** 1.8 * 16 : 3 + amount ** 1.8 * 38;
    smooth(preamp.gain, driveAmount * (1 + boost * 2.5));
    smooth(ampLevel.gain, .65 / driveAmount ** .3);
    smooth(lowCut.frequency, settings.amp === "lead" ? 105 : settings.cabinet === "stack" ? 85 : 65);
    smooth(boostColor.gain, boost * 5);
    smooth(bass.gain, (settings.bass - 50) * .18);
    smooth(middle.gain, (settings.middle - 50) * .18);
    smooth(treble.gain, (settings.treble - 50) * .18);
    smooth(presence.gain, (settings.presence - 50) * .12);
    smooth(cabinetBody.gain, settings.cabinet === "stack" ? 3 : 1);
    smooth(cabinetBody.frequency, settings.cabinet === "stack" ? 115 : 160);
    smooth(cabinetTop.frequency, settings.cabinet === "stack" ? 4600 : 7200);

    const chorus = settings.chorusEnabled ? settings.chorus / 100 : 0;
    smooth(chorusWet.gain, chorus * .45);
    smooth(chorusDry.gain, 1 - chorus * .3);
    smooth(chorusDepth.gain, chorus * .006);
    const delayAmount = settings.delayEnabled ? settings.delay / 100 : 0;
    smooth(delaySend.gain, delayAmount > 0 ? 1 : 0);
    smooth(delayWet.gain, delayAmount * .4);
    smooth(delayFeedback.gain, delayAmount > 0 ? .15 + delayAmount * .29 : 0);
    smooth(delay.delayTime, settings.delayTime / 1000, .045);
    const reverb = settings.reverbEnabled ? settings.reverb / 100 : 0;
    smooth(reverbSend.gain, reverb > 0 ? 1 : 0);
    smooth(reverbWet.gain, reverb * .42);
    // Stop feeding hidden tails during bypass; silence also lets the browser idle effects.
    smooth(processedInput.gain, settings.enabled ? 1 : 0);
    smooth(processed.gain, settings.enabled ? 1 : 0);
    smooth(bypass.gain, settings.enabled ? 0 : 1);
    smooth(master.gain, .85 * (settings.volume / 100) ** 1.2);
  };
  update(initialSettings);
  initializing = false;
  lfo.start();

  return {
    input,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      lfo.stop();
      for (const node of nodes) node.disconnect();
    },
  };
}
