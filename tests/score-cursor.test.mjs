import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as alphaTab from '@coderline/alphatab';
import { findScoreCursorBeat } from '../lib/score-cursor.ts';

function scorePlayback() {
  const xml = `<?xml version="1.0"?><score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
    <part id="P1">${[1, 2, 3].map(number => `<measure number="${number}">
      ${number === 1 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="60.1"/></direction>' : ''}
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>`).join('')}</part></score-partwise>`;
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(xml), settings);
  const file = new alphaTab.midi.MidiFile();
  const generator = new alphaTab.midi.MidiFileGenerator(score, settings, new alphaTab.midi.AlphaSynthMidiFileHandler(file, false));
  generator.generate();
  const event = () => {
    const listeners = [];
    return { on(fn) { listeners.push(fn); return () => {}; }, trigger(...args) { for (const fn of listeners) fn(...args); } };
  };
  // Exercise the actual sequencer with no audio device or sample output.
  const output = {
    sampleRate: 44100, ready: event(), samplesPlayed: event(), sampleRequest: event(),
    open() { this.ready.trigger(); }, resetSamples() {}, pause() {}, destroy() {},
    play() { throw new Error('This test must remain silent'); },
    addSamples() { throw new Error('This test must not render audio'); },
  };
  const player = new alphaTab.synth.AlphaSynth(output, 500);
  player.loadMidiFile(file);
  return { cache: generator.tickLookup, player };
}

test('near-end and exact-end seeks resolve the final beat without changing the sequencer clock', () => {
  const { cache, player } = scorePlayback();
  try {
    for (const speed of [.5, .75, 1]) {
      player.playbackSpeed = speed;
      const end = player.currentPosition.endTime;
      for (const time of [end - .1, end]) {
        player.timePosition = time;
        const tick = player.tickPosition;
        assert.equal(cache.findBeat(new Set([0]), tick), null, 'reproduces the exclusive-end engine lookup');
        const lookup = findScoreCursorBeat(cache, [0], tick);
        assert.equal(lookup.beat.voice.bar.index, 2);
        assert.equal(lookup.nextBeat, null);
        assert.equal(player.timePosition, time);
        assert.equal(player.tickPosition, tick);
      }
    }
  } finally { player.destroy(); }
});

test('normal seeks keep the engine beat and unavailable tracks do not get a fallback', () => {
  const { cache, player } = scorePlayback();
  try {
    for (const tick of [0, 1000, 3840, 5000, 7680, 11000]) {
      assert.equal(findScoreCursorBeat(cache, [0], tick).beat, cache.findBeat(new Set([0]), tick).beat);
    }
    assert.equal(findScoreCursorBeat(cache, [99], 11520), null);
    assert.equal(findScoreCursorBeat(cache, [], 11520), null);
    assert.equal(findScoreCursorBeat(null, [0], 11520), null);
  } finally { player.destroy(); }
});
