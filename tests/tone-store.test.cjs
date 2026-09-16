const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(saved = {}, blocked = false) {
  const storage = new Map(Object.entries(saved));
  const events = {};
  const graphs = [];
  let nextId = 0;
  const compile = file => ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const engine = { exports: {} };
  vm.runInNewContext(compile('../lib/tone-rig.ts'), { module: engine, exports: engine.exports });
  const module = { exports: {} };
  const audio = { ...engine.exports, createToneRig(_context, settings) {
    const graph = { settings, updates: 0, disposed: false, input: {},
      update(next) { this.settings = next; this.updates++; }, dispose() { this.disposed = true; } };
    graphs.push(graph); return graph;
  } };
  vm.runInNewContext(compile('../lib/tone-store.ts'), {
    module, exports: module.exports, require: () => audio,
    crypto: { randomUUID: () => `user-${++nextId}` },
    window: {
      localStorage: { getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
        setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); } },
      addEventListener(name, fn) { events[name] = fn; }
    }
  });
  return { ...module.exports, storage, graphs, events };
}

test('migrates saved six-knob settings once and respects the new settings thereafter', () => {
  const store = load({ 'fretflow-tone-guide-v1': JSON.stringify({ gain: 3, bass: 4, middle: 6, treble: 7, delay: 0, reverb: 2 }) });
  store.initializeToneStore();
  assert.equal(store.getToneSnapshot().settings.gain, 30);
  assert.equal(store.getToneSnapshot().settings.middle, 60);
  assert.equal(store.getToneSnapshot().settings.delayEnabled, false);
  assert.equal(store.getToneSnapshot().settings.reverbEnabled, true);
  store.setToneSettings({ ...store.getToneSnapshot().settings, gain: 81 });
  const reloaded = load(Object.fromEntries(store.storage));
  reloaded.initializeToneStore();
  assert.equal(reloaded.getToneSnapshot().settings.gain, 81);
});

test('all active outputs update immediately and disposed outputs leave the subscription', () => {
  const store = load();
  const chord = store.attachToneRig({}), notes = store.attachToneRig({});
  let notifications = 0;
  const unsubscribe = store.subscribeTone(() => notifications++);
  store.setToneSettings({ ...store.getToneSnapshot().settings, treble: 76 });
  assert.equal(store.graphs[0].settings.treble, 76);
  assert.equal(store.graphs[1].settings.treble, 76);
  chord.dispose(); chord.dispose(); unsubscribe();
  store.setToneSettings({ ...store.getToneSnapshot().settings, treble: 20 });
  assert.equal(store.graphs[0].updates, 1);
  assert.equal(store.graphs[1].updates, 2);
  assert.equal(notifications, 1);
  notes.dispose();
});

test('named presets preserve a snapshot, update matching names, and never evict at capacity', () => {
  const store = load();
  store.saveTonePreset(' My clean ');
  const first = store.getToneSnapshot().presets[0];
  store.setToneSettings({ ...store.getToneSnapshot().settings, gain: 90 });
  assert.notEqual(first.settings.gain, 90);
  store.saveTonePreset('my CLEAN');
  assert.equal(store.getToneSnapshot().presets.length, 1);
  assert.equal(store.getToneSnapshot().presets[0].id, first.id);
  assert.equal(store.getToneSnapshot().presets[0].settings.gain, 90);
  for (let i = 0; i < 23; i++) store.saveTonePreset(`Sound ${i}`);
  store.saveTonePreset('Overflow');
  assert.equal(store.getToneSnapshot().presets.length, 24);
  assert.ok(store.getToneSnapshot().presets.some(preset => preset.id === first.id));
  store.deleteTonePreset(first.id);
  assert.equal(store.getToneSnapshot().presets.length, 23);
});

test('blocked storage remains usable and another tab updates the current audio without write-back', () => {
  const blocked = load({}, true);
  assert.doesNotThrow(() => { blocked.initializeToneStore(); blocked.saveTonePreset('Session'); });
  assert.equal(blocked.getToneSnapshot().presets.length, 1);
  const store = load();
  store.attachToneRig({});
  const changed = { settings: { ...store.getToneSnapshot().settings, gain: 67 }, presets: [] };
  store.events.storage({ key: 'fretflow-tone-rig-v1', newValue: JSON.stringify(changed) });
  assert.equal(store.graphs[0].settings.gain, 67);
  assert.equal(store.storage.size, 0);
  assert.doesNotThrow(() => store.events.storage({ key: 'fretflow-tone-rig-v1', newValue: 'bad JSON' }));
});
