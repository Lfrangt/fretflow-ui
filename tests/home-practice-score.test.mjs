import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// The app uses bundler-style relative imports. Compile the actual pure modules
// with the project's TypeScript compiler instead of mocking their algorithms.
const require = createRequire(import.meta.url);
const ts = require('typescript');
function loadModule(filename) {
  const source = readFileSync(filename, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: specifier =>
    specifier.startsWith('.') ? loadModule(path.resolve(path.dirname(filename), `${specifier}.ts`)) : require(specifier),
  }, { filename });
  return module.exports;
}
const lib = fileURLToPath(new URL('../lib/', import.meta.url));
const { buildPerformanceHomeScore: build, homeScoreTime: clamp, homeScoreNotesAtTime: active,
  homeScoreStepAtTime: stepAt, homeScoreStepTime: stepTime } = loadModule(path.join(lib, 'home-practice-score.ts'));
const { practicePerformance } = loadModule(path.join(lib, 'practice-performance.ts'));
const plain = value => JSON.parse(JSON.stringify(value));
const note = (start, end, midi, extra = {}) => ({ start, end, midi, ...extra });
const data = (notes, duration = 8, steps = []) => ({ notes, duration, steps });

test('uses already offset-relative performance times without subtracting offset twice', () => {
  const performance = practicePerformance({ id: 'take', revision: 4, mode: 'solo', duration: 9, clip_start: 42,
    score_settings: { offset: 2, bpm: 80, tuning: 'standard', capo: 0 }, chords: [],
    notes: [note(1.5, 2.5, 64), note(3.25, 4.8, 67)] });
  const before = structuredClone(performance);
  const score = build(performance);
  assert.equal(score.source, 'performance-notes');
  assert.equal(score.tuning, 'standard');
  assert.equal(score.duration, 7);
  assert.deepEqual(plain(score.notes.map(n => [n.start, n.end, n.midi])), [[0, .5, 64], [1.25, 2.8, 67]]);
  assert.ok(score.notes.every(n => n.positionSource === 'suggested'));
  assert.deepEqual(plain(performance), before);
});

test('empty, excluded and invalid events never become chord-derived notes', () => {
  const input = data([note(0, 1, 60, { excluded: true }), note(-1, 1, 64), note(1, 1, 64), note(1, Infinity, 64),
    note(NaN, 2, 64), note(1, 2, 64.5), note(1, 2, 128), note(8, 9, 64)], 8,
  [{ start: 0, end: 8, label: 'Emaj7' }]);
  const score = build(input);
  assert.equal(score.notes.length, 0);
  assert.equal(score.unplacedNoteCount, 0);
  assert.equal(build(data([], 0)).duration, 0);
  assert.equal(build(data([note(0, 1, 64)], NaN)).notes.length, 0);
  assert.equal(build(data([note(0, 1, 64)], -1)).notes.length, 0);
});

test('rest gaps and exact note/score ends have no fabricated active notes', () => {
  const score = build(data([note(1, 2, 64), note(4, 9, 67)], 6,
    [{ start: 1, end: 2, label: 'E4' }, { start: 4, end: 9, label: 'G4' }]));
  assert.equal(active(score, 0).length, 0);
  assert.equal(active(score, 1).length, 1);
  assert.equal(active(score, 2).length, 0);
  assert.equal(stepAt(score, 3), -1);
  assert.equal(stepAt(score, 4), 1);
  assert.equal(score.notes[1].end, 6);
  assert.equal(score.steps[1].end, 6);
  assert.equal(active(score, 6).length, 0);
  assert.equal(stepAt(score, 6), -1);
  assert.equal(active(score, NaN).length, 0);
});

test('simultaneous pitches use separate strings and preserve all original intervals', () => {
  const input = data([note(.125, 3, 60), note(.125, 1.4, 64), note(.125, 2.5, 67)], 4);
  const before = structuredClone(input);
  const score = build(input, { min: 5, max: 12 });
  assert.equal(new Set(score.notes.map(n => n.string)).size, 3);
  assert.deepEqual(plain(score.notes.map(n => [n.start, n.end, n.midi])), [[.125, 3, 60], [.125, 1.4, 64], [.125, 2.5, 67]]);
  assert.equal(active(score, 1).length, 3);
  assert.equal(active(score, 2).length, 2);
  assert.deepEqual(input, before);
});

test('source open strings survive and mismatched source pitches become explicit suggestions', () => {
  const score = build(data([note(0, 1, 64, { string: 1, fret: 0 }), note(1, 2, 38, { string: 6, fret: 0 }),
    note(2, 3, 67, { string: 1, fret: 0 })], 4), { min: 5, max: 12 });
  assert.deepEqual(plain(score.notes[0]), { id: 'note:0', sourceIndex: 0, start: 0, end: 1, midi: 64,
    string: 1, fret: 0, stepIndex: -1, positionSource: 'source' });
  assert.equal(score.unplacedNoteCount, 1); // D2 is below standard tuning, never octave-shifted.
  assert.equal(score.notes[1].midi, 67);
  assert.equal(score.notes[1].positionSource, 'suggested');
  const drop = build({ ...data([note(0, 1, 38, { string: 6, fret: 0 })]), tuning: 'drop-d' });
  assert.equal(drop.tuning, 'drop-d');
  assert.equal(drop.notes[0].positionSource, 'source');
  assert.equal(drop.notes[0].fret, 0);
  assert.equal(build({ ...data([], 0), tuning: 'drop-d' }).tuning, 'drop-d');
  assert.equal(build(data([])).tuning, 'standard');
});

test('capo positions remain absolute frets and no playable pitch is transposed', () => {
  const score = build({ ...data([note(0, 1, 66, { string: 1, fret: 2 }), note(1, 2, 40)]), capo: 2 });
  assert.equal(score.notes[0].fret, 2);
  assert.equal(score.notes[0].midi, 66);
  assert.equal(score.notes[0].positionSource, 'source');
  assert.equal(score.unplacedNoteCount, 1);
});

test('two manually assigned guitar tracks and stable source indices remain distinct', () => {
  const score = build(data([note(2, 3, 67, { track: 2 }), note(0, 1, 64, { track: 1, string: 1, fret: 0 }),
    note(0, 1, 64, { track: 2, string: 1, fret: 0 })]));
  assert.deepEqual(plain(score.notes.map(n => [n.id, n.track])), [['note:1', 1], ['note:2', 2], ['note:0', 2]]);
  assert.equal(active(score, .5).length, 2);
});

test('a new onset cannot reassign or reuse the string of a different sustaining pitch', () => {
  const score = build(data([note(0, 3, 64, { string: 1, fret: 0 }), note(1, 2, 67)], 4), { min: 0, max: 5 });
  assert.equal(score.notes[0].string, 1);
  assert.equal(score.notes[0].fret, 0);
  assert.equal(score.notes[0].end, 3);
  assert.notEqual(score.notes[1].string, 1);
  assert.equal(active(score, 1.5).length, 2);
  assert.equal(new Set(active(score, 1.5).map(n => n.string)).size, 2);
});

test('an occupied source string is not silently moved and becomes available after note-off', () => {
  const score = build(data([note(0, 2, 64, { string: 1, fret: 0 }), note(1, 1.5, 67, { string: 1, fret: 3 }),
    note(2, 3, 67, { string: 1, fret: 3 })], 4));
  assert.equal(score.unplacedNoteCount, 1);
  assert.deepEqual(plain(score.notes.map(n => n.sourceIndex)), [0, 2]);
  assert.equal(score.notes[1].string, 1);
  assert.equal(score.notes[1].fret, 3);
});

test('equal pitches on two guitar tracks can share a sustained physical position', () => {
  const score = build(data([note(0, 3, 64, { track: 1, string: 1, fret: 0 }),
    note(1, 2, 64, { track: 2, string: 1, fret: 0 })], 4));
  assert.equal(score.unplacedNoteCount, 0);
  assert.equal(active(score, 1.5).length, 2);
  assert.ok(score.notes.every(n => n.string === 1 && n.fret === 0));
});

test('each guitar keeps different simultaneous and sustaining pitches on its own source string', () => {
  const score = build(data([
    note(0, 3, 64, { track: 1, string: 1, fret: 0 }),
    note(0, 1, 67, { track: 2, string: 1, fret: 3 }),
    note(1, 2, 69, { track: 2, string: 1, fret: 5 }),
  ], 4));
  assert.equal(score.unplacedNoteCount, 0);
  assert.deepEqual(plain(score.notes.map(n => [n.id, n.track, n.string, n.fret, n.positionSource])), [
    ['note:0', 1, 1, 0, 'source'], ['note:1', 2, 1, 3, 'source'], ['note:2', 2, 1, 5, 'source'],
  ]);
  assert.deepEqual(plain(active(score, 1.5).map(n => [n.midi, n.track])), [[64, 1], [69, 2]]);
  assert.equal(score.notes[0].end, 3);
});

test('six sustaining strings on guitar 1 do not consume suggested positions on guitar 2', () => {
  const open = [64, 59, 55, 50, 45, 40];
  const source = open.map((midi, index) => note(0, 3, midi, { track: 1, string: index + 1, fret: 0 }));
  const second = [65, 60, 56, 51, 46, 41].map(midi => note(1, 2, midi, { track: 2 }));
  const score = build(data([...source, ...second], 4));
  const other = score.notes.filter(n => n.track === 2);
  assert.equal(score.unplacedNoteCount, 0);
  assert.equal(active(score, 1.5).length, 12);
  assert.equal(new Set(other.map(n => n.string)).size, 6);
  assert.ok(other.every(n => n.positionSource === 'suggested'));
  assert.deepEqual(plain(other.map(n => n.sourceIndex)), [6, 7, 8, 9, 10, 11]);
});

test('unassigned notes keep their metadata and share only guitar 1 occupancy', () => {
  const score = build(data([
    note(0, 3, 64, { string: 1, fret: 0 }),
    note(1, 2, 67, { track: 1, string: 1, fret: 3 }),
    note(1, 2, 69, { track: 2, string: 1, fret: 5 }),
  ], 4));
  assert.equal(score.unplacedNoteCount, 1);
  assert.deepEqual(plain(score.notes.map(n => [n.sourceIndex, n.track ?? null])), [[0, null], [2, 2]]);
});

test('all occupied strings yield an explicit omission without truncating prior sustains', () => {
  const open = [64, 59, 55, 50, 45, 40];
  const source = open.map((midi, index) => note(0, 3, midi, { string: index + 1, fret: 0 }));
  const score = build(data([...source, note(1, 2, 67)], 4));
  assert.equal(score.notes.length, 6);
  assert.equal(score.unplacedNoteCount, 1);
  assert.ok(score.notes.every(n => n.end === 3));
});

test('latest overlapping step wins, while step IDs still map to caller indices', () => {
  const score = build(data([note(2, 2.5, 67)], 6, [
    { start: 2, end: 3, label: 'later' }, { start: -1, end: 1, label: 'invalid' },
    { start: 1, end: 4, label: 'sustain' },
  ]));
  assert.equal(stepAt(score, 2.4), 0);
  assert.equal(stepAt(score, 3.4), 2);
  assert.equal(score.notes[0].stepIndex, 0);
  assert.equal(stepTime(score, 0), 2);
  assert.equal(stepTime(score, 2), 1);
});

test('seek clamping covers both ends, tiny/empty clips and long performances in seconds', () => {
  const score = build(data([note(3599.25, 3601, 64)], 3600, [{ start: 3599.25, end: 3601, label: 'E4' }]));
  assert.equal(clamp(score, -10), 0);
  assert.equal(clamp(score, Infinity), 3599.999);
  assert.equal(clamp(score, 3600), 3599.999);
  assert.equal(clamp(score, NaN), 0);
  assert.equal(stepTime(score, 0), 3599.25);
  assert.equal(active(score, 3599.5)[0].midi, 64);
  assert.equal(clamp({ duration: .0005 }, 1), .00025);
  assert.equal(clamp({ duration: 0 }, 1), 0);
  assert.equal(stepTime(build(data([])), 20), 0);
});
