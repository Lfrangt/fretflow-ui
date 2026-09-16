export type ToneSettings = { gain: number; bass: number; middle: number; treble: number; delay: number; reverb: number };
// Authored listening starting points, not estimates from a recording or any
// particular amplifier's electrical response. All knobs use a 0–10 scale.
export const TONE_STARTS: { name: string; settings: ToneSettings }[] = [
  { name: "Clean & bright", settings: { gain: 1, bass: 4, middle: 5, treble: 6, delay: 0, reverb: 2 } },
  { name: "Warm clean", settings: { gain: 1, bass: 5, middle: 6, treble: 3, delay: 0, reverb: 2 } },
  { name: "Crunch rhythm", settings: { gain: 5, bass: 4, middle: 6, treble: 5, delay: 0, reverb: 1 } },
  { name: "Singing lead", settings: { gain: 6, bass: 4, middle: 7, treble: 5, delay: 2, reverb: 2 } },
];
export const TONE_CONTROLS: { key: keyof ToneSettings; label: string; help: string }[] = [
  { key: "gain", label: "Drive / gain", help: "More drive adds grit and sustain. Start low to keep chords clear." },
  { key: "bass", label: "Bass EQ", help: "Adds low-end weight. Lower it if chords sound muddy." },
  { key: "middle", label: "Middle", help: "Shapes the body of the guitar. Raise it to bring a lead forward." },
  { key: "treble", label: "Treble", help: "Adds brightness and pick attack. Lower it if the sound is sharp." },
  { key: "delay", label: "Delay mix", help: "Adds audible repeats. The preview uses a fixed 300 ms delay." },
  { key: "reverb", label: "Reverb mix", help: "Adds room ambience. Keep it subtle while checking notes." },
];
export function validTone(value: unknown): value is ToneSettings {
  return Boolean(value && typeof value === "object" && TONE_CONTROLS.every(({ key }) => {
    const n = (value as ToneSettings)[key]; return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10;
  }));
}

/** A short synthesized phrase for comparing controls, not a guitar/amp model. */
export function previewTone(context: AudioContext, tone: ToneSettings) {
  const nodes: AudioNode[] = [];
  const own = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
  const input = own(context.createGain()); input.gain.value = .22;
  const drive = own(context.createWaveShaper());
  const curve = new Float32Array(2048), amount = 1 + tone.gain * 2.5;
  for (let i = 0; i < curve.length; i++) { const x = i * 2 / (curve.length - 1) - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  drive.curve = curve; drive.oversample = "2x";
  const bass = own(context.createBiquadFilter()); bass.type = "lowshelf"; bass.frequency.value = 180; bass.gain.value = (tone.bass - 5) * 2;
  const middle = own(context.createBiquadFilter()); middle.type = "peaking"; middle.frequency.value = 850; middle.Q.value = .7; middle.gain.value = (tone.middle - 5) * 2;
  const treble = own(context.createBiquadFilter()); treble.type = "highshelf"; treble.frequency.value = 2400; treble.gain.value = (tone.treble - 5) * 2;
  const cabinet = own(context.createBiquadFilter()); cabinet.type = "lowpass"; cabinet.frequency.value = 4800;
  const output = own(context.createGain()); output.gain.value = .16 / Math.sqrt(1 + tone.gain / 2);
  input.connect(drive).connect(bass).connect(middle).connect(treble).connect(cabinet).connect(output);
  const delay = own(context.createDelay(1)); delay.delayTime.value = .3;
  const feedback = own(context.createGain()); feedback.gain.value = .26;
  const delayMix = own(context.createGain()); delayMix.gain.value = tone.delay * .05;
  cabinet.connect(delay).connect(feedback).connect(delay); delay.connect(delayMix).connect(output);
  const room = own(context.createConvolver());
  const impulse = context.createBuffer(2, Math.round(context.sampleRate * 1.2), context.sampleRate);
  let seed = 173;
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 2147483647 * 2 - 1) * Math.exp(-i / context.sampleRate * 6); }
  }
  room.buffer = impulse;
  const reverbMix = own(context.createGain()); reverbMix.gain.value = tone.reverb * .045;
  cabinet.connect(room).connect(reverbMix).connect(output);
  const limiter = own(context.createDynamicsCompressor()); limiter.threshold.value = -12; limiter.ratio.value = 12;
  output.connect(limiter).connect(context.destination);
  const voices: OscillatorNode[] = [];
  [52,59,64,67,71,67,64,59].forEach((midi, index) => {
    const start = context.currentTime + .02 + index * .24;
    const oscillator = own(context.createOscillator()); oscillator.type = "triangle"; oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const envelope = own(context.createGain()); envelope.gain.setValueAtTime(.0001, start); envelope.gain.exponentialRampToValueAtTime(.8, start + .006); envelope.gain.exponentialRampToValueAtTime(.0001, start + .65);
    oscillator.connect(envelope).connect(input); oscillator.start(start); oscillator.stop(start + .7); voices.push(oscillator);
  });
  return () => { voices.forEach(voice => { try { voice.stop(); } catch { /* Already ended. */ } }); nodes.forEach(node => node.disconnect()); };
}
