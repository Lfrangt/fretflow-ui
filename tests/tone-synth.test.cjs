const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(sampleRate = 1000, resume = () => Promise.resolve(true)) {
  const intervals = new Set(), contexts = [], rigs = [];
  class Context {
    sampleRate = sampleRate;
    currentTime = 0;
    state = 'running';
    sources = [];
    constructor() { contexts.push(this); }
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, sampleRate: rate, duration: length / rate, getChannelData: channel => data[channel] };
    }
    createBufferSource() {
      const source = {
        buffer: null, stopped: false, disconnected: false,
        connect(destination) { this.destination = destination; },
        disconnect() { this.disconnected = true; },
        start(time, offset) { this.time = time; this.offset = offset; },
        stop() { this.stopped = true; }
      };
      this.sources.push(source);
      return source;
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../lib/tone-synth.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, window: { AudioContext: Context },
    require(name) {
      if (name === './audio-playback') return { resumeAudioPlayback: resume };
      if (name === './tone-store') return { attachToneRig(context) {
        const rig = { input: { context }, disposed: false, dispose() { this.disposed = true; } };
        rigs.push(rig); return rig;
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
    setInterval(callback) { intervals.add(callback); return callback; },
    clearInterval(callback) { intervals.delete(callback); }
  });
  return { ...module.exports, Context, contexts, rigs, intervals,
    tick(time) { for (const context of contexts) context.currentTime = time; for (const callback of [...intervals]) callback(); }
  };
}

function streaming(h, frames = 50) {
  const context = new h.Context();
  const output = new h.ToneSynthOutput(context);
  let requested = 0, played = 0;
  output.sampleRequest.on(() => { requested++; output.addSamples(new Float32Array(frames * 2).fill(.25)); });
  output.samplesPlayed.on(frames => { played += frames; });
  output.open(120);
  return { output, context, requested: () => requested, played: () => played };
}

test('PCM keeps stereo channels and every source enters the owned tone rig', () => {
  const h = harness(), { output, context } = streaming(h);
  output.resetSamples();
  output.addSamples(new Float32Array([.1, -.2, .3, -.4]));
  output.play();
  const source = context.sources[0];
  assert.ok(Math.abs(source.buffer.getChannelData(0)[1] - .3) < 1e-6);
  assert.ok(Math.abs(source.buffer.getChannelData(1)[0] + .2) < 1e-6);
  assert.ok(context.sources.every(source => source.destination === h.rigs[0].input));
  output.destroy();
});

test('buffering is bounded and the playback clock counts consumed frames, not scheduling or timer delay', () => {
  const h = harness(), s = streaming(h);
  s.output.play();
  assert.equal(s.requested(), 3, '120 ms horizon permits only three 50 ms blocks');
  assert.equal(s.played(), 0);
  h.tick(.052);
  assert.equal(s.played(), 40);
  h.tick(.052);
  assert.equal(s.played(), 40, 'a frozen or suspended audio clock does not advance');
  h.tick(1);
  assert.equal(s.played(), 200, 'an underflow gap is never reported as played PCM');
  assert.ok(s.context.sources.at(-1).time < 1.2, 'late pumps refill a bounded horizon');
  s.output.destroy();
  assert.equal(h.intervals.size, 0);
});

test('pause preserves unread PCM and resumes at the exact frame while flushing effect tails', () => {
  const h = harness(), s = streaming(h);
  s.output.play();
  s.context.currentTime = .037;
  s.output.pause();
  assert.equal(s.played(), 25);
  assert.ok(s.context.sources.every(source => source.stopped));
  assert.equal(h.rigs[0].disposed, true);
  assert.equal(h.intervals.size, 0);
  h.tick(5);
  s.output.play();
  const resumed = s.context.sources[3];
  assert.equal(resumed.offset, .025);
  assert.equal(s.requested(), 3, 'resume reuses unread audio, without skipping ahead in the synth');
  assert.notEqual(resumed.destination, h.rigs[0].input);
  h.tick(5.037);
  assert.equal(s.played(), 50);
  s.output.destroy();
});

test('seek discards scheduled samples and old tails without advancing the new clock', () => {
  const h = harness(), s = streaming(h);
  s.output.play();
  s.context.currentTime = .037;
  s.output.resetSamples();
  assert.equal(s.played(), 0, 'the old position cannot leak into the new clock');
  assert.ok(s.context.sources.every(source => source.stopped));
  assert.equal(h.rigs[0].disposed, true);
  h.tick(.04);
  assert.equal(s.requested(), 6);
  h.tick(.079);
  assert.equal(s.played(), 30);
  s.output.destroy();
});

test('a synchronous loop/seek from samplesPlayed cannot schedule stale data', () => {
  const h = harness(), s = streaming(h);
  const unsubscribe = s.output.samplesPlayed.on(() => { unsubscribe(); s.output.resetSamples(); });
  s.output.play();
  h.tick(.062);
  assert.equal(s.requested(), 3, 'the invalidated pump stops after the loop seeks');
  assert.ok(s.context.sources.every(source => source.stopped || source.disconnected));
  h.tick(.082);
  assert.equal(s.requested(), 6);
  s.output.destroy();
});

test('rejected activation pauses safely and reports the failure through the factory callback', async () => {
  const h = harness(48000, () => Promise.resolve(false));
  let blocked = 0;
  class AlphaSynth {
    constructor(output) { this.output = output; this.rateBeforeOpen = output.sampleRate; output.open(120); }
    pause() { this.paused = true; this.output.pause(); }
  }
  const player = h.createTonePlayer({ synth: { AlphaSynth } }, () => { blocked++; });
  assert.equal(player.rateBeforeOpen, 48000);
  player.output.activate();
  player.output.play();
  await Promise.resolve();
  assert.equal(blocked, 1);
  assert.equal(player.paused, true);
  assert.equal(h.intervals.size, 0);
  player.output.destroy();
  assert.equal(h.contexts[0].state, 'closed');
});

test('official alphaSynth still renders the shipped guitar bank and preserves MIDI timing through pause and seek', async () => {
  const engine = await import('@coderline/alphatab');
  const { buildPerformanceMidi } = await import('../lib/performance-midi.ts');
  const h = harness(48000);
  const player = h.createTonePlayer(engine);
  const data = fs.readFileSync(require.resolve('../public/soundfonts/freepats-classical-guitar.sf2'));
  player.loadSoundFont(new Uint8Array(data), false);
  player.loadMidiFile(buildPerformanceMidi(engine, [
    { start: .1, end: .8, midi: 60, name: 'C4', activation: .2 },
    { start: .117, end: .7, midi: 64, name: 'E4', activation: .2 }
  ], 1));
  assert.equal(player.isReadyForPlayback, true);
  assert.equal(player.play(), true);
  h.tick(.112);
  assert.ok(Math.abs(player.tickPosition / 1920 - .1) < .001);
  assert.ok(h.contexts[0].sources.some(source => source.buffer.getChannelData(0).some(value => Math.abs(value) > .0001)), 'real soundfont produces nonzero PCM');
  player.pause();
  const pausedAt = player.tickPosition;
  h.tick(.5);
  assert.equal(player.tickPosition, pausedAt);
  assert.equal(player.play(), true);
  h.tick(.612);
  assert.ok(Math.abs(player.tickPosition / 1920 - .2) < .001, 'resume consumes the next 100 ms without skipping the buffered phrase');
  player.tickPosition = 960;
  assert.ok(Math.abs(player.tickPosition - 960) <= 1, 'alphaSynth rounds its tick/time conversion to one MIDI tick');
  h.tick(.632);
  h.tick(.712);
  assert.ok(Math.abs(player.tickPosition / 1920 - .576) < .001, 'seek starts a new PCM clock');
  for (let time = .752; time < 2; time += .04) h.tick(time);
  assert.equal(player.state, engine.synth.PlayerState.Paused, 'end-of-song drains the synth and stops playback');
  assert.equal(h.intervals.size, 0);
  player.destroy();
  assert.equal(h.intervals.size, 0);
});
