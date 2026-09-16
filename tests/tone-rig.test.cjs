const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const moduleSource = ts.transpileModule(fs.readFileSync(require.resolve('../lib/tone-rig.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(moduleSource, { module: loaded, exports: loaded.exports });
const { DEFAULT_TONE_RIG, TONE_RIG_PRESETS, normalizeToneRig, createToneRig } = loaded.exports;
const plain = value => JSON.parse(JSON.stringify(value));

class Parameter {
  constructor(value = 0) { this.value = value; this.events = []; }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  setTargetAtTime(value, time, duration) { this.value = value; this.events.push(['target', value, time, duration]); }
}

class Node {
  constructor(kind) { this.kind = kind; this.connections = []; this.disconnectCount = 0; }
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnectCount++; this.connections = []; }
}

class Context {
  constructor() {
    this.currentTime = 5; this.sampleRate = 8000; this.nodes = []; this.buffers = [];
    this.destination = new Node('destination'); this.resumeCount = 0;
  }
  node(kind, params = {}) {
    const node = new Node(kind);
    for (const [key, value] of Object.entries(params)) node[key] = new Parameter(value);
    this.nodes.push(node); return node;
  }
  createGain() { return this.node('gain', { gain: 1 }); }
  createBiquadFilter() { return this.node('filter', { frequency: 350, Q: 1, gain: 0 }); }
  createWaveShaper() { return this.node('shaper'); }
  createDelay(maximum) { const node = this.node('delay', { delayTime: 0 }); node.maximum = maximum; return node; }
  createConvolver() { return this.node('convolver'); }
  createDynamicsCompressor() { return this.node('compressor', { threshold: -24, knee: 30, ratio: 12, attack: .003, release: .25 }); }
  createOscillator() {
    const node = this.node('oscillator', { frequency: 440 });
    node.starts = 0; node.stops = 0;
    node.start = () => { node.starts++; }; node.stop = () => { node.stops++; };
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    const buffer = { channels, length, sampleRate, getChannelData: channel => data[channel] };
    this.buffers.push(buffer); return buffer;
  }
  resume() { this.resumeCount++; throw new Error('Rig must not own browser audio unlocking'); }
}

test('stored controls default invalid types, bound numbers, and do not guess a legacy scale', () => {
  for (const value of [null, undefined, [], 'bad', 17]) {
    assert.deepEqual(plain(normalizeToneRig(value)), plain(DEFAULT_TONE_RIG));
  }
  const result = normalizeToneRig({
    gain: 8, volume: -20, bass: 150, middle: '64.5', treble: ' ', presence: Infinity,
    delay: NaN, reverb: false, boost: { valueOf: () => 70 }, delayTime: '2000',
    amp: 'evil', cabinet: 'stack', enabled: false, chorusEnabled: 'true', boostEnabled: true,
  });
  assert.equal(result.gain, 8, '0–10 legacy values are not silently multiplied');
  assert.equal(result.volume, 0); assert.equal(result.bass, 100); assert.equal(result.middle, 64.5);
  for (const key of ['treble', 'presence', 'delay', 'reverb', 'boost', 'chorusEnabled']) {
    assert.equal(result[key], DEFAULT_TONE_RIG[key]);
  }
  assert.equal(result.delayTime, 800); assert.equal(normalizeToneRig({ delayTime: -10 }).delayTime, 80);
  assert.equal(result.amp, 'clean'); assert.equal(result.cabinet, 'stack');
  assert.equal(result.enabled, false); assert.equal(result.boostEnabled, true);
  result.gain = 99;
  assert.equal(DEFAULT_TONE_RIG.gain, 28, 'normalization returns an independent settings object');
});

test('six independent presets cover clean, crunch, lead, and audible effects', () => {
  assert.equal(TONE_RIG_PRESETS.length, 6);
  assert.equal(new Set(TONE_RIG_PRESETS.map(preset => preset.id)).size, 6);
  assert.equal(new Set(TONE_RIG_PRESETS.map(preset => preset.settings)).size, 6);
  assert.deepEqual([...new Set(TONE_RIG_PRESETS.map(preset => preset.settings.amp))].sort(), ['clean', 'crunch', 'lead']);
  for (const preset of TONE_RIG_PRESETS) {
    assert.match(preset.name, /[A-Za-z]/);
    assert.deepEqual(plain(normalizeToneRig(preset.settings)), plain(preset.settings));
    assert.equal(preset.settings.enabled, true);
  }
  assert.ok(TONE_RIG_PRESETS.some(preset => preset.settings.chorusEnabled && preset.settings.delayEnabled && preset.settings.reverb > 50));
});

test('live edits reuse the graph and impulse, smooth parameters, and never unlock the context', () => {
  const context = new Context();
  const rig = createToneRig(context, DEFAULT_TONE_RIG);
  const nodeCount = context.nodes.length;
  const impulse = context.buffers[0];
  assert.equal(context.buffers.length, 1);
  assert.equal(context.nodes.find(node => node.kind === 'oscillator').starts, 1);
  for (let value = 0; value <= 100; value++) {
    rig.update({ ...DEFAULT_TONE_RIG, gain: value, bass: value, chorus: value, delayTime: 80 + value * 7.2 });
  }
  assert.equal(context.nodes.length, nodeCount);
  assert.equal(context.buffers.length, 1);
  assert.equal(context.buffers[0], impulse);
  assert.equal(context.resumeCount, 0);
  const parameters = context.nodes.flatMap(node => Object.values(node).filter(value => value instanceof Parameter));
  const edits = parameters.flatMap(param => param.events).filter(event => event[0] === 'target');
  assert.ok(edits.length > 100);
  for (const [, value, time, duration] of edits) {
    assert.ok(Number.isFinite(value)); assert.equal(time, 5); assert.ok(duration > 0);
  }
});

test('bypass has a dry route, volume zero mutes both routes, and output keeps a sample ceiling', () => {
  const context = new Context();
  const customOutput = new Node('recording');
  const rig = createToneRig(context, DEFAULT_TONE_RIG, customOutput);
  const bypass = rig.input.connections.find(node => node.kind === 'gain');
  const master = bypass.connections[0];
  const processed = context.nodes.find(node => node !== bypass && node.connections.includes(master));
  assert.equal(bypass.gain.value, 0); assert.equal(processed.gain.value, 1);
  rig.update({ ...DEFAULT_TONE_RIG, enabled: false });
  assert.equal(bypass.gain.value, 1); assert.equal(processed.gain.value, 0);
  const processedInput = rig.input.connections.find(node => node !== bypass);
  assert.equal(processedInput.gain.value, 0, 'bypass stops feeding hidden effect tails');
  assert.ok(master.gain.value > 0);
  rig.update({ ...DEFAULT_TONE_RIG, enabled: false, volume: 0 });
  assert.equal(master.gain.value, 0);
  rig.update({ ...DEFAULT_TONE_RIG, enabled: true, volume: 0 });
  assert.equal(master.gain.value, 0);
  assert.equal(processedInput.gain.value, 1);
  const compressor = master.connections[0];
  const ceiling = compressor.connections[0];
  assert.equal(compressor.kind, 'compressor'); assert.equal(ceiling.kind, 'shaper');
  assert.equal(ceiling.connections[0], customOutput);
  assert.ok(Array.from(ceiling.curve).every(value => Math.abs(value) <= .940001));
  assert.equal(context.destination.disconnectCount, 0);
});

test('amp types change drive, EQ reaches neutral, and delay feedback remains bounded at extreme settings', () => {
  const context = new Context();
  const rig = createToneRig(context, DEFAULT_TONE_RIG);
  const drive = context.nodes.find(node => node.kind === 'shaper' && node.oversample === '2x');
  const preamp = context.nodes.find(node => node.connections.includes(drive));
  const gains = [];
  for (const amp of ['clean', 'crunch', 'lead']) {
    rig.update({ ...DEFAULT_TONE_RIG, amp, gain: 50 }); gains.push(preamp.gain.value);
  }
  assert.ok(gains[0] < gains[1] && gains[1] < gains[2]);
  const delay = context.nodes.find(node => node.kind === 'delay' && node.maximum === 1);
  const feedback = delay.connections.find(node => node.connections.some(next => next.kind === 'filter'));
  rig.update({ ...DEFAULT_TONE_RIG, bass: 50, middle: 50, treble: 50, presence: 50, delayEnabled: true, delay: 1e6, delayTime: 1e6 });
  assert.equal(delay.delayTime.value, .8);
  assert.ok(feedback.gain.value > 0 && feedback.gain.value <= .440001);
  const eq = context.nodes.filter(node => [150, 750, 2200, 3500].includes(node.frequency?.value));
  assert.equal(eq.length, 4);
  assert.ok(eq.every(node => node.gain.value === 0));
  rig.update({ ...DEFAULT_TONE_RIG, delayEnabled: false });
  assert.equal(feedback.gain.value, 0);
});

test('the room is deterministic and stereo, disposal stops modulation and disconnects only owned nodes', () => {
  const first = new Context(); const second = new Context();
  const rig = createToneRig(first, DEFAULT_TONE_RIG);
  const secondRig = createToneRig(second, DEFAULT_TONE_RIG);
  const impulse = first.buffers[0];
  assert.deepEqual(impulse.getChannelData(0), second.buffers[0].getChannelData(0));
  assert.notDeepEqual(impulse.getChannelData(0), impulse.getChannelData(1));
  assert.ok(impulse.getChannelData(0).some(value => value !== 0));
  rig.dispose(); rig.dispose();
  assert.equal(first.nodes.find(node => node.kind === 'oscillator').stops, 1);
  assert.ok(first.nodes.every(node => node.disconnectCount === 1));
  assert.equal(first.destination.disconnectCount, 0);
  assert.doesNotThrow(() => rig.update(DEFAULT_TONE_RIG));
  secondRig.dispose();
});

test('parameter smoothing supports browsers without cancelAndHoldAtTime', () => {
  const context = new Context();
  const rig = createToneRig(context, DEFAULT_TONE_RIG);
  for (const node of context.nodes) {
    for (const parameter of Object.values(node)) if (parameter instanceof Parameter) parameter.cancelAndHoldAtTime = undefined;
  }
  assert.doesNotThrow(() => rig.update({ ...DEFAULT_TONE_RIG, gain: 88 }));
  const parameters = context.nodes.flatMap(node => Object.values(node).filter(value => value instanceof Parameter));
  assert.ok(parameters.some(param => param.events.some(event => event[0] === 'cancel')));
  rig.dispose();
});
