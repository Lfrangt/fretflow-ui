const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(navigator = {}, timers = {}) {
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../lib/audio-playback.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, navigator, setTimeout, clearTimeout, ...timers });
  return module.exports;
}

test('music requests a playback session and gracefully handles unsupported browsers', () => {
  const navigator = { audioSession: { type: 'auto' } };
  load(navigator).prepareAudioPlayback();
  assert.equal(navigator.audioSession.type, 'playback');
  assert.doesNotThrow(() => load().prepareAudioPlayback());
  assert.doesNotThrow(() => load({ get audioSession() { throw new Error('unsupported'); } }).prepareAudioPlayback());
});

test('suspended and iOS interrupted contexts resume synchronously within the click', async () => {
  for (const state of ['suspended', 'interrupted']) {
    let called = false;
    const context = { state, resume() { called = true; this.state = 'running'; return Promise.resolve(); } };
    const result = load().resumeAudioPlayback(context);
    assert.equal(called, true);
    assert.equal(await result, true);
  }
});

test('a rejected or still interrupted context never reports successful playback', async () => {
  const audio = load();
  assert.equal(await audio.resumeAudioPlayback({ state: 'interrupted', resume: () => Promise.resolve() }), false);
  assert.equal(await audio.resumeAudioPlayback({ state: 'suspended', resume: () => Promise.reject(new Error('blocked')) }), false);
  assert.equal(await audio.resumeAudioPlayback({ state: 'closed' }), false);
  assert.equal(await audio.resumeAudioPlayback({ state: 'running' }), true);
});

test('a browser that never resolves resume returns a retryable failure', async () => {
  const audio = load({}, { setTimeout: callback => setTimeout(callback, 1) });
  assert.equal(await audio.resumeAudioPlayback({ state: 'suspended', resume: () => new Promise(() => {}) }), false);
});

test('editing or pausing invalidates an earlier pending audio resume', async () => {
  let finish;
  const context = { state: 'suspended', resume: () => new Promise(resolve => { finish = resolve; }) };
  const controller = new AbortController();
  const pending = load().resumeAudioPlayback(context, controller.signal);
  controller.abort();
  context.state = 'running';
  finish();
  assert.equal(await pending, false);
  assert.equal(await load().resumeAudioPlayback(context), true, 'fresh playback still works');
  assert.equal(await load().resumeAudioPlayback(context, controller.signal), false);
});
