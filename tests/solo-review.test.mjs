import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSoloNotes, soloLoop, practiceEligibility } from '../lib/solo-review.ts';
const note = (start, end, midi, extra = {}) => ({ start, end, midi, activation: .7, name: 'unused', ...extra });

test('solo groups use silence after sustain, with stable source indices for corrections', () => {
  const notes = [note(1.85, 2.3, 67), note(.1, 1.5, 64), note(.5, .8, 62), note(2.4, 2.8, 69)];
  const saved = structuredClone(notes);
  const analysis = analyzeSoloNotes(notes, 3);
  assert.deepEqual(analysis.phrases, [{ start: .1, end: 1.5, indices: [1, 2] }, { start: 1.85, end: 2.8, indices: [0, 3] }]);
  assert.deepEqual([analysis.low, analysis.high, analysis.count], [62, 69, 4]);
  assert.deepEqual(notes, saved);
});

test('excluded and invalid notes do not invent a pitch range or bridge solo phrases', () => {
  const notes = [note(.1, .4, 60), note(.3, 2, 100, { excluded: true }), note(1, 2, 64), note(2, 1, 10), note(2, 3, NaN), note(-1, 1, 40), note(3, 4, 128), note(4, 5, 67), note(2, 3, 64.5)];
  const analysis = analyzeSoloNotes(notes, 4);
  assert.deepEqual([analysis.low, analysis.high, analysis.count], [60, 64, 2]);
  assert.deepEqual(analysis.phrases.map(p => p.indices), [[0], [2]]);
});

test('corrected pitches and note removals immediately alter range and phrase count', () => {
  const notes = [note(0, .2, 64), note(.4, .7, 67), note(.9, 1.2, 72)];
  assert.equal(analyzeSoloNotes(notes, 2).phrases.length, 1);
  const revised = analyzeSoloNotes([notes[0], { ...notes[1], excluded: true }, { ...notes[2], midi: 65 }], 2);
  assert.equal(revised.phrases.length, 2);
  assert.deepEqual([revised.low, revised.high], [64, 65]);
});

test('empty and fully removed takes have an unknown range, not fabricated zero-pitch notes', () => {
  assert.deepEqual(analyzeSoloNotes([note(0, 1, 64, { excluded: true })], 2), { count: 0, low: null, high: null, phrases: [] });
});

test('phrase end and padded listening loops stay inside the actual recording', () => {
  assert.equal(analyzeSoloNotes([note(.1, 9, 64)], 2).phrases[0].end, 2);
  assert.deepEqual(soloLoop(.05, 1.9, 2), { start: 0, end: 2 });
  assert.deepEqual(soloLoop(1, 2, 4), { start: .88, end: 2.18 });
});

const take = (notes, offset = 1, changes = {}) => ({ duration: 3, mode: 'solo', notes, chords: [], score_settings: { offset }, ...changes });
test('practice rejects notes removed by score offset, but keeps sustain crossing the offset', () => {
  assert.equal(practiceEligibility(take([note(0, 1, 64)])).allowed, false);
  assert.equal(practiceEligibility(take([note(.8, 1.1, 64)])).allowed, true);
  assert.equal(practiceEligibility(take([note(2, 3, 64)], 3)).allowed, false);
  assert.equal(practiceEligibility(take([note(2, 3, 64)], 9)).allowed, false);
  assert.equal(practiceEligibility(take([note(0, .1, 64)], -9)).allowed, true);
});

test('practice eligibility rejects invalid or excluded notes and empty clipped segments', () => {
  const bad = [note(1, 2, 64, { excluded: true }), note(NaN, 2, 64), note(1, Infinity, 64), note(1, 2, NaN), note(1, 2, 128), note(1, 2, 64.5), note(2, 2, 64), note(3, 4, 64), note(-1, 2, 64)];
  assert.equal(practiceEligibility(take(bad)).allowed, false);
  assert.equal(practiceEligibility(take([note(1, 2, 64)], NaN)).allowed, false);
  assert.equal(practiceEligibility(null).allowed, false);
});

test('chord practice also respects offset, and Solo never falls back to stale chords', () => {
  const source = take([], 1, { mode: 'chords', chords: [{ start: 0, end: 1, root: 0 }] });
  assert.deepEqual(practiceEligibility(source), { notes: false, chords: false, allowed: false });
  source.chords[0].end = 2;
  assert.deepEqual(practiceEligibility(source), { notes: false, chords: true, allowed: true });
  source.mode = 'solo';
  assert.equal(practiceEligibility(source).allowed, false);
  source.chords[0].root = null;
  source.mode = 'both';
  assert.equal(practiceEligibility(source).allowed, false);
});
