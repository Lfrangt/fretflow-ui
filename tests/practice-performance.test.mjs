import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practicePerformance, chordAtTime, stepAtTime, practiceRange, soundingMidi } from '../lib/practice-performance.ts';
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

test('a Solo becomes a note timeline without fabricated harmony and retains source offsets', () => {
  const input = { ...source, id: 'solo/take', revision: 3, mode: 'solo', clip_start: 42, chords: [],
    score_settings: { offset: 1, bpm: 90, capo: 2, tuning: 'drop-d' },
    notes: [
      { start: 3, end: 3.4, midi: 67, track: 1 },
      { start: .7, end: 1.4, midi: 64, velocity: 37 },
      { start: 1.8, end: 2.2, midi: 66, excluded: true },
      { start: 7.8, end: 9, midi: 69 },
      { start: 9, end: 10, midi: 71 },
    ] };
  const before = structuredClone(input);
  const data = practicePerformance(input);
  assert.equal(data.timelineKind, 'notes');
  assert.deepEqual(data.chords, []);
  assert.equal(data.sourceStart, 42);
  assert.equal(data.offset, 1);
  assert.equal(data.originalUrl, '/api/transcription/jobs/solo%2Ftake/audio');
  assert.equal(data.sourceId, 'solo/take');
  assert.equal(data.revision, 3);
  assert.equal(data.capo, 2);
  assert.equal(data.tuning, 'drop-d');
  assert.deepEqual(data.steps.map(step => step.label), ['E4', 'G4', 'A4']);
  assert.equal(data.steps[0].start, 0);
  assert.equal(data.steps.at(-1).end, 7);
  assert.deepEqual(soundingMidi(data, 1), []);
  assert.equal(stepAtTime(data, 1), -1);
  assert.equal(stepAtTime(data, 2.1), 1);
  assert.deepEqual(practiceRange(data, 'hold', 1), { start: 2, end: 2.4 });
  assert.deepEqual(practiceRange(data, 'pair', 1), { start: 2, end: 7 });
  assert.deepEqual(practiceRange(data, 'pair', 200), { start: 6.8, end: 7 });
  assert.deepEqual(practiceRange(data, 'full', 0), { start: 0, end: 7 });
  assert.deepEqual(input, before);
});

test('legacy note-only results retain simultaneous attacks and rests as notes, not chords', () => {
  const data = practicePerformance({ ...source, mode: 'notes', chords: [],
    score_settings: { offset: 0, bpm: 100 }, notes: [
      { start: 1, end: 3, midi: 60 }, { start: 1, end: 1.5, midi: 64 },
      { start: 2, end: 2.5, midi: 67 },
    ] });
  assert.equal(data.timelineKind, 'notes');
  assert.deepEqual(data.chords, []);
  assert.equal(data.steps.length, 2);
  assert.equal(data.steps[0].label, 'C4 · E4');
  assert.equal(stepAtTime(data, .9), -1);
  assert.equal(stepAtTime(data, 2.1), 1);
  assert.deepEqual(soundingMidi(data, 2.1), [60, 67]);
  assert.deepEqual(practiceRange(data, 'pair', 0), { start: 1, end: 3 });
  assert.deepEqual(soundingMidi(data, 3), []);
});

test('empty or entirely trimmed note results never invent a practice step', () => {
  const data = practicePerformance({ ...source, mode: 'solo', chords: [],
    notes: [{ start: 0, end: .5, midi: 64 }], score_settings: { offset: 1, bpm: 100 } });
  assert.deepEqual(data.steps, []);
  assert.deepEqual(data.notes, []);
  assert.equal(stepAtTime(data, 0), -1);
  assert.deepEqual(practiceRange(data, 'hold', 0), { start: 0, end: 7 });
});

test('malformed notes do not poison playback of the remaining valid Solo notes', () => {
  const data = practicePerformance({ ...source, mode: 'solo', chords: [],
    score_settings: { offset: 0, bpm: 100 }, notes: [
      { start: 1, end: 2, midi: 64 },
      { start: 1, end: 2, midi: 60.5 },
      { start: 1, end: 2, midi: NaN },
      { start: NaN, end: 2, midi: 65 },
      { start: -1, end: 2, midi: 66 },
      { start: 1, end: Infinity, midi: 67 },
      { start: 1, end: 1, midi: 68 },
      { start: 1, end: 2, midi: 128 },
      { start: 1, end: 2, midi: -1 },
    ] });
  assert.deepEqual(data.notes, [{ start: 1, end: 2, midi: 64 }]);
  assert.deepEqual(data.steps, [{ start: 1, end: 2, midis: [64], label: 'E4' }]);
  assert.deepEqual(soundingMidi(data, 1.5), [64]);
});
