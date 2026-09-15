import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupEstimatedAttacks } from '../lib/note-attacks.ts';

const n = (start, end, midi, rest = {}) => ({ start, end, midi, name: String(midi), activation: .6, ...rest });

test('successive single plucks remain single despite overlapping sustain', () => {
  const groups = groupEstimatedAttacks([n(.1, 1, 60), n(.4, .9, 64)]);
  assert.deepEqual(groups.map(g => g.kind), ['single', 'single']);
  assert.deepEqual(groups[1].ringing, [0]);
});

test('a real two-pitch attack stays a double candidate without moving either onset', () => {
  const notes = [n(.1, .7, 60), n(.12, .6, 64)];
  const original = structuredClone(notes);
  assert.deepEqual(groupEstimatedAttacks(notes)[0].indices, [0, 1]);
  assert.equal(groupEstimatedAttacks(notes)[0].kind, 'double');
  assert.deepEqual(notes, original);
});

test('octave double stops are marked for listening and neither note is deleted', () => {
  const notes = [n(.1, .7, 60), n(.1, .6, 72)];
  const [group] = groupEstimatedAttacks(notes);
  assert.equal(group.kind, 'double');
  assert.deepEqual(group.harmonicPairs, [[0, 1]]);
  assert.equal(notes.length, 2);
  assert.ok(notes.every(n => !n.excluded));
});

test('an arpeggio cannot chain its neighboring attacks into one giant group', () => {
  const groups = groupEstimatedAttacks([n(.1, .9, 60), n(.13, .9, 64), n(.16, .9, 67)]);
  assert.deepEqual(groups.map(g => g.indices), [[0, 1], [2]]);
});

test('a later attack does not inherit a double-stop label from two ringing notes', () => {
  const groups = groupEstimatedAttacks([n(.1, .7, 60), n(.1, .7, 64), n(.4, .8, 67)]);
  assert.equal(groups[1].kind, 'single');
  assert.deepEqual(groups[1].ringing, [0, 1]);
});

test('two same-pitch detections remain an explicit unison question', () => {
  assert.equal(groupEstimatedAttacks([n(.1, .8, 60), n(.12, .7, 60)])[0].kind, 'unison');
});

test('edits and exclusions are reflected without mutating input or losing original indices', () => {
  const notes = [n(.1, .8, 72, { excluded: true }), n(.12, .7, 60, { edited: true })];
  const groups = groupEstimatedAttacks(notes);
  assert.equal(groups[0].kind, 'single');
  assert.deepEqual(groups[0].indices, [1]);
});
