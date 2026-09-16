const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the component's actual playback functions without a test-only
// production export or a dependency on rendering the entire practice UI.
const source = fs.readFileSync(require.resolve('../components/guitar-workspace.tsx'), 'utf8');
const file = ts.createSourceFile('workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['playChordSound', 'stopChordSound'].includes(node.name?.text)) {
    functions.set(node.name.text, node.getText(file));
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert.equal(functions.size, 2);
const script = ts.transpileModule([...functions.values()].join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness() {
  const voices = [], rigs = [];
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {} });
  const context = {
    state: 'running', currentTime: 0,
    createOscillator() {
      const voice = { ...node(), frequency: parameter(), detune: parameter(), stops: [], start() {}, stop(at) { this.stops.push(at); } };
      voices.push(voice); return voice;
    },
    createGain: () => ({ ...node(), gain: parameter() }),
    createBiquadFilter: () => ({ ...node(), frequency: parameter(), Q: parameter() }),
  };
  const state = {
    activeTone: { oscillator: 'triangle', detune: 0, filter: 1500, gain: .07, decay: 1.45 },
    activeIndex: 0, soundEnabled: true,
    connectedShapes: [[{ string: 0, fret: 3 }], [], [{ string: 1, fret: 2 }]],
    openStringMidi: [40, 45], midiToFrequency: midi => 440 * 2 ** ((midi - 69) / 12),
    chordPlayGeneration: { current: 0 }, chordVoicesRef: { current: new Set() }, chordToneRef: { current: null },
    setToneStopToken() {}, setAudioBlocked() {}, setIsPlaying() {},
    unlockAudioContext: async () => context,
    attachToneRig() { const rig = { input: node(), disposed: false, dispose() { this.disposed = true; } }; rigs.push(rig); return rig; },
  };
  vm.createContext(state); vm.runInContext(script, state);
  return { state, context, voices, rigs, play: (...args) => state.playChordSound(...args) };
}

test('N.C. damps active voices and effect tails, then the next chord recreates its audio route', async () => {
  const h = harness();
  await h.play('C');
  assert.equal(h.voices.length, 2);
  const oldRig = h.rigs[0];
  await h.play('N.C.', undefined, false, 1);
  assert.ok(h.voices.every(voice => voice.stops.at(-1) === undefined), 'all scheduled voices stopped immediately');
  assert.equal(h.state.chordVoicesRef.current.size, 0);
  assert.equal(oldRig.disposed, true, 'effect graph disconnected to remove delay and reverb tails');
  assert.equal(h.state.chordToneRef.current, null);
  await h.play('N.C.', undefined, false, 1);
  assert.equal(h.rigs.length, 1, 'repeated rests do not create a silent graph');
  await h.play('Am', undefined, false, 2);
  assert.equal(h.voices.length, 4);
  assert.equal(h.rigs.length, 2);
  assert.equal(h.rigs[1].disposed, false);
});

test('N.C. cancels an older chord waiting for audio resume without unlocking audio itself', async () => {
  const h = harness();
  let resume, unlocks = 0;
  h.state.unlockAudioContext = () => { unlocks++; return new Promise(resolve => { resume = resolve; }); };
  const pendingChord = h.play('C');
  const rest = h.play('N.C.', undefined, false, 1);
  assert.equal(unlocks, 1);
  resume(h.context);
  await Promise.all([pendingChord, rest]);
  assert.equal(h.voices.length, 0);
  assert.equal(h.rigs.length, 0);
});

test('ordinary chord changes preserve the shared tone graph and sustained decay', async () => {
  const h = harness();
  await h.play('C');
  await h.play('Am', undefined, false, 2);
  assert.equal(h.rigs.length, 1);
  assert.equal(h.rigs[0].disposed, false);
  assert.ok(h.voices.every(voice => voice.stops.length === 1 && voice.stops[0] > 0));
});
