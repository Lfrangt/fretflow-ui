import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as alphaTab from '@coderline/alphatab';
import { buildPerformanceMidi } from '../lib/performance-midi.ts';

const note = (start, end, midi, flags = {}) => ({ start, end, midi, name: '', activation: .2, ...flags });
const events = file => file.tracks.flatMap(track => track.events);
const onsets = file => events(file).filter(event => event instanceof alphaTab.midi.NoteOnEvent);

test('preserves close picking intervals, pitch and explicit dynamics without a score grid', () => {
  const notes = [note(.101, .8, 60, { velocity: 47 }), note(.117, .71, 64, { velocity: 112 }), note(.173, .92, 67)];
  const attacks = onsets(buildPerformanceMidi(alphaTab, notes, 1));
  assert.equal(new Set(attacks.map(event => event.tick)).size, 3);
  for (let i = 0; i < notes.length; i++) {
    assert.ok(Math.abs(attacks[i].tick / 1920 - notes[i].start) <= .000261);
    assert.equal(attacks[i].noteKey, notes[i].midi);
  }
  assert.deepEqual(attacks.map(event => event.noteVelocity), [47, 112, 95]);
});

test('overlapping repetitions use separate channels, without shortening either sustain', () => {
  const notes = [note(.1, .8, 60), note(.17, .5, 60)];
  const file = buildPerformanceMidi(alphaTab, notes, 1);
  const attacks = onsets(file);
  assert.notEqual(attacks[0].channel, attacks[1].channel);
  const ends = events(file).filter(event => event instanceof alphaTab.midi.NoteOffEvent);
  assert.deepEqual(ends.map(event => event.tick / 1920), [.5, .8]);
  assert.ok(attacks.every(event => event.channel !== 9));
});

test('exclusions and edits reach playback; activation does not become playing strength', () => {
  const notes = [note(.1, .8, 60, { excluded: true }), note(.17, .5, 63, { edited: true, activation: .99 })];
  const attacks = onsets(buildPerformanceMidi(alphaTab, notes, 1));
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].noteKey, 63);
  assert.equal(attacks[0].noteVelocity, 95);
});

test('invalid timing is rejected instead of silently quantized or repaired', () => {
  assert.throws(() => buildPerformanceMidi(alphaTab, [note(.5, .4, 60)], 1));
});

test('every sounding channel selects the only guitar preset in the shipped sound bank', () => {
  const bytes = readFileSync(new URL('../public/soundfonts/freepats-classical-guitar.sf2', import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL('../public/soundfonts/freepats-classical-guitar.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  function* chunks(start, end) {
    while (start + 8 <= end) {
      const size = bytes.readUInt32LE(start + 4);
      assert.ok(start + 8 + size <= end);
      yield { tag: bytes.toString('ascii', start, start + 4), start: start + 8, size };
      start += 8 + size + (size % 2);
    }
  }
  const pdta = [...chunks(12, bytes.length)].find(c => c.tag === 'LIST' && bytes.toString('ascii', c.start, c.start + 4) === 'pdta');
  const presets = [...chunks(pdta.start + 4, pdta.start + pdta.size)].find(c => c.tag === 'phdr');
  assert.equal(presets.size, 76); // One actual preset plus the required EOP terminator.
  assert.equal(bytes.toString('ascii', presets.start, presets.start + 20).replace(/\0+$/, ''), 'Classical guitar');
  assert.equal(bytes.readUInt16LE(presets.start + 20), 24);
  assert.equal(bytes.readUInt16LE(presets.start + 22), 0);
  const file = buildPerformanceMidi(alphaTab, [note(.1, .8, 60), note(.2, .9, 60)], 1);
  const programs = events(file).filter(e => e instanceof alphaTab.midi.ProgramChangeEvent);
  for (const attack of onsets(file)) {
    assert.ok(programs.some(p => p.channel === attack.channel && p.program === 24 && p.tick <= attack.tick));
  }
});
