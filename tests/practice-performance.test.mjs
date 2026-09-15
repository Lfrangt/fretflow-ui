import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practicePerformance, chordAtTime, practiceRange } from '../lib/practice-performance.ts';
const source = { duration: 8, score_settings: { offset: 1, bpm: 117.5 },
  notes: [{ start: .8, end: 1.8, midi: 60, velocity: 43 }, { start: 2.17, end: 4.1, midi: 64 }, { start: 2.2, end: 3, midi: 72, excluded: true }],
  chords: [{ start: 0, end: 2, root: 0 }, { start: 2, end: 3, root: null }, { start: 3, end: 5, root: 7 }] };
test('practice retains picking, sustain, explicit velocity and edits across the score handoff', () => {
  const result = practicePerformance(source);
  assert.equal(result.duration, 7); assert.equal(result.bpm, 117.5);
  assert.deepEqual(result.notes, [{ start: 0, end: .8, midi: 60, velocity: 43 }, { start: 1.17, end: 3.0999999999999996, midi: 64 }]);
  assert.deepEqual(source.notes[0], { start: .8, end: 1.8, midi: 60, velocity: 43 });
});
test('original recording seeks use the same offset and loop boundaries as the chord guide', () => {
  const result = practicePerformance({ ...source, id: 'local-take' });
  assert.equal(result.originalUrl, '/api/transcription/jobs/local-take/audio');
  assert.equal(result.offset, 1);
  assert.deepEqual(practiceRange(result, 'full', 0), { start: 0, end: 7 });
  assert.deepEqual(practiceRange(result, 'pair', 0), { start: 0, end: 4 });
  assert.deepEqual(practiceRange(result, 'hold', 1), { start: 2, end: 4 });
  assert.equal(result.offset + practiceRange(result, 'hold', 1).start, 3);
});
test('chord guide follows the performance clock and leaves no-chord gaps intact', () => {
  const result = practicePerformance(source);
  assert.equal(chordAtTime(result, .99), 0);
  assert.equal(chordAtTime(result, 1.5), -1);
  assert.equal(chordAtTime(result, 2), 1);
  assert.equal(chordAtTime(result, 4), -1);
});
