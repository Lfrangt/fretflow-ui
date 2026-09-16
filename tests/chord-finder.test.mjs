import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyChord, nameShape, validShape } from '../lib/chord-finder.ts';
const shape = frets => frets.flatMap((fret, index) => fret === null ? [] : [{ string: 6-index, fret, interval: '', finger: 0 }]);

test('recognizes open, barre, high-position and inverted chords without changing the shape', () => {
  for (const [frets, name] of [
    [[null,3,2,0,1,0], 'C'], [[1,3,3,2,1,1], 'F'],
    [[null,null,10,9,8,8], 'C'], [[0,3,2,0,1,0], 'C/E'],
    [[null,0,2,2,1,0], 'Am'], [[3,5,null,null,null,null], 'G5']
  ]) {
    const input = shape(frets), before = structuredClone(input);
    assert.equal(identifyChord(input)[0].name, name);
    assert.deepEqual(input, before);
  }
});

test('ambiguous names and omitted fifths are disclosed instead of guessing one truth', () => {
  const matches = identifyChord(shape([null,3,2,2,1,3]));
  assert.ok(matches.some(m => m.name === 'C6'));
  assert.ok(matches.some(m => m.name === 'Am7/C'));
  const ninth = identifyChord(shape([null,5,4,5,5,null])).find(m => m.name === 'D9');
  assert.ok(ninth?.omittedFifth);
});

test('empty, single-pitch and malformed positions never invent a chord', () => {
  for (const input of [[], shape([0,null,null,null,null,null]), shape([0,null,2,null,null,0]), shape([22,0,null,null,null,null]),
    [{string:1,fret:0},{string:1,fret:3}], [{string:0,fret:1}], [{string:1,fret:NaN}]]) assert.deepEqual(identifyChord(input), []);
  assert.equal(validShape(shape([0,0,0,0,0,0])), true);
  assert.deepEqual(nameShape(shape([null,3,2,0,1,0]), 0).map(m => m.interval), ['R','3','5','R','3']);
});
