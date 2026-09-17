import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordScaleCandidates, chordDegree, detectKey } from '../lib/harmony.ts';

const ids = (chord, options) => chordScaleCandidates(chord, options).map(candidate => candidate.id);
const pitchClass = note => {
  const [letter, ...accidentals] = [...note];
  return (12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter]
    + accidentals.reduce((pitch, sign) => pitch + (sign === '#' ? 1 : -1), 0)) % 12;
};

test('common chords have stable, bounded practice candidates', () => {
  for (const [chord, expected] of [
    ['Cmaj7', ['ionian', 'lydian']],
    ['Fmaj7#11', ['lydian']],
    ['G7', ['mixolydian', 'lydian-dominant', 'mixolydian-b6']],
    ['G7alt', ['altered']],
    ['Dm7', ['dorian', 'aeolian', 'phrygian']],
    ['Em7b5', ['locrian', 'locrian-natural-2']],
    ['Cdim7', ['whole-half-diminished']],
    ['CmMaj7', ['melodic-minor', 'harmonic-minor']],
    ['Cmaj7#5', ['lydian-augmented']],
    ['C7b9#11', ['half-whole-diminished', 'altered']],
    ['Cm6b9', ['dorian-b2']]
  ]) assert.deepEqual(ids(chord), expected, chord);
  assert.ok(ids('Caug').includes('whole-tone'));
});

test('every proposed scale includes the actual altered, diminished and extended chord pitches', () => {
  // Independent sounding pitch-class references, including enharmonic tensions.
  for (const [chord, required] of [
    ['Cmaj7', [0, 4, 7, 11]], ['Fmaj7#11', [5, 9, 0, 4, 11]],
    ['G7alt', [7, 11, 5, 3]], ['Dm7', [2, 5, 9, 0]],
    ['Em7b5', [4, 7, 10, 2]], ['Cdim7', [0, 3, 6, 9]],
    ['CmMaj7', [0, 3, 7, 11]], ['Caug', [0, 4, 8]],
    ['C7b9#11', [0, 4, 10, 1, 6]], ['Cmaj7#5', [0, 4, 8, 11]],
    ['C13b9', [0, 4, 10, 9, 1]], ['Cm9', [0, 3, 10, 2]],
    ['Cm11', [0, 3, 10, 5]], ['C7b13', [0, 4, 10, 8]],
    ['C7#9', [0, 4, 10, 3]], ['C7sus4', [0, 5, 7, 10]],
    ['Cmaj7/Db', [0, 4, 7, 11, 1]]
  ]) {
    const candidates = chordScaleCandidates(chord);
    assert.ok(candidates.length <= 3, chord);
    for (const candidate of candidates) {
      const pitches = candidate.notes.map(pitchClass);
      assert.ok(required.every(pitch => pitches.includes(pitch)), `${chord} / ${candidate.id}`);
      assert.deepEqual(candidate.chordToneFlags, pitches.map(pitch => required.includes(pitch)), chord);
    }
  }
  assert.deepEqual(ids('Cmaj7add11#11'), []); // Neither plain major nor Lydian contains both fourths.
  assert.deepEqual(ids('Cmaj7b9'), []);
  assert.ok(!ids('CmMaj7').some(id => ['dorian', 'aeolian', 'phrygian'].includes(id)));
  const altered = chordScaleCandidates('G7alt')[0];
  assert.ok(!altered.intervals.includes(2));
  assert.ok(!altered.intervals.includes(7));
});

test('degree spelling produces readable notes and preserves sharp and flat roots', () => {
  for (const [chord, expected] of [
    ['Cmaj7', ['C', 'D', 'E', 'F', 'G', 'A', 'B']],
    ['Dbmaj7', ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C']],
    ['F#maj7', ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']],
    ['C#maj7', ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#']],
    ['Cbmaj7', ['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']]
  ]) assert.deepEqual(chordScaleCandidates(chord)[0].notes, expected, chord);
  const degreesToPitch = degree => {
    const [, accidental, number] = /^([b#]*)(\d+)$/.exec(degree);
    return (12 + [0, 2, 4, 5, 7, 9, 11][(Number(number) - 1) % 7]
      + [...accidental].reduce((pitch, sign) => pitch + (sign === '#' ? 1 : -1), 0)) % 12;
  };
  for (const root of ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'Cb', 'B#']) {
    for (const suffix of ['maj7', 'm7', '7', '7alt', 'dim7', 'm7b5', 'mMaj7', 'aug', 'm6b9', '7b9#11']) {
      for (const candidate of chordScaleCandidates(root + suffix)) {
        assert.equal(candidate.root, root);
        assert.equal(candidate.notes.length, candidate.degrees.length);
        assert.equal(candidate.notes.length, candidate.chordToneFlags.length);
        assert.equal(new Set(candidate.notes.map(pitchClass)).size, candidate.notes.length);
        candidate.notes.forEach((note, index) => {
          assert.equal((pitchClass(note) - pitchClass(root) + 12) % 12, candidate.intervals[index]);
          assert.equal(degreesToPitch(candidate.degrees[index]), candidate.intervals[index]);
        });
      }
    }
  }
});

test('slash bass and the sounding fingering add constraints without changing the root', () => {
  assert.deepEqual(chordScaleCandidates('Cmaj7/E'), chordScaleCandidates('Cmaj7'));
  assert.deepEqual(ids('Cmaj7/F#'), ['lydian']);
  assert.equal(chordScaleCandidates('Cmaj7/F#')[0].root, 'C');
  assert.deepEqual(ids('Cmaj7/Db'), []);
  assert.deepEqual(ids('Cmaj7', { chordPitchClasses: [0, 4, 7, 11, 6] }), ['lydian']);
  assert.deepEqual(ids('Cmaj7', { chordPitchClasses: [0, 4, 7, 11, 1] }), []);
  assert.deepEqual(ids('Fmaj7#11', { chordPitchClasses: [5, 9, 0, 4, 10] }), []);
  // A voiced perfect fifth explicitly rules out the altered collection.
  assert.deepEqual(ids('G7alt', { chordPitchClasses: [7, 11, 5, 3, 2] }), []);
  for (const invalid of [[NaN], [12], [-1], [1.5]]) assert.deepEqual(ids('Cmaj7', { chordPitchClasses: invalid }), []);
});

test('manual key is only an optional exact pitch-collection badge, never a sort or detection', () => {
  const noKey = chordScaleCandidates('Dm7');
  assert.ok(noKey.every(candidate => !Object.hasOwn(candidate, 'keyMatch')));
  assert.deepEqual(ids('Dm7', { key: 'F' }), ids('Dm7'));
  assert.deepEqual(chordScaleCandidates('Dm7', { key: 'C' }).map(candidate => candidate.keyMatch), [true, false, false]);
  assert.deepEqual(chordScaleCandidates('Dm7', { key: 'F' }).map(candidate => candidate.keyMatch), [false, true, false]);
  assert.equal(chordScaleCandidates('Fmaj7#11', { key: 'C' })[0].keyMatch, true);
  assert.equal(chordScaleCandidates('Cdim7', { key: 'C' })[0].keyMatch, false);
  // Existing roman-numeral/key-estimate semantics are untouched.
  assert.equal(chordDegree('Dm7', 'C'), 'ii');
  assert.equal(detectKey(['Dm7', 'G7', 'Cmaj7']), 'C');
});

test('known aliases work, unsupported or malformed labels never invent a candidate', () => {
  for (const chord of ['N.C.', 'NC', '', ' ', 'H7', 'Cunknown', 'Cmystery', 'C7oops', 'Cmaj7/E/G', 'C,maj7', 'C((maj7)', 'Cmaj7)', 'Cmaj7/Hz', null, undefined]) {
    assert.deepEqual(ids(chord), [], String(chord));
  }
  for (const [alias, canonical] of [['Fmaj7(#11)', 'Fmaj7#11'], ['C7(b9,#11)', 'C7b9#11'],
    ['D♭maj7', 'Dbmaj7'], ['F♯m7', 'F#m7'], ['CmMaj7', 'Cmmaj7'], ['CM7', 'Cmaj7'],
    ['CΔ7', 'Cmaj7'], ['Cø7', 'Cm7b5'], ['C°7', 'Cdim7'], ['C+', 'Caug']]) {
    assert.deepEqual(chordScaleCandidates(alias), chordScaleCandidates(canonical), alias);
  }
});

test('returned arrays can be edited by callers without corrupting later suggestions', () => {
  const original = chordScaleCandidates('Cmaj7');
  const editable = chordScaleCandidates('Cmaj7');
  editable[0].intervals[0] = 99;
  editable[0].notes[0] = 'wrong';
  editable[0].degrees[0] = 'wrong';
  editable[0].chordToneFlags[0] = false;
  assert.deepEqual(chordScaleCandidates('Cmaj7'), original);
});
