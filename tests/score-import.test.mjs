import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as alphaTab from '@coderline/alphatab';
import { chartChord, parseChordText, parseScoreChords, chordParts } from '../lib/score-import.ts';
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Source chart</work-title></work><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><barline location="left"><repeat direction="forward"/></barline><direction><sound tempo="96"/></direction><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony><note><rest/><duration>16</duration><type>whole</type></note></measure><measure number="2"><harmony><root><root-step>G</root-step></root><kind>dominant</kind></harmony><note><rest/><duration>16</duration><type>whole</type></note><barline location="right"><repeat direction="backward"/></barline></measure></part></score-partwise>`;
const load = source => alphaTab.importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(source));

test('barred text, sections and unequal explicit durations survive import', () => {
  const chart = parseChordText('{title: My tune}\n{tempo: 84}\n[Verse]\n| C | Am F |\n[Chorus]\nG:1.5 N.C.:0.5 C:2');
  assert.equal(chart.title, 'My tune'); assert.equal(chart.bpm, 84);
  assert.deepEqual(chart.steps.map(s => [s.chord,s.beats,s.section]), [['C',4,'Verse'],['Am',2,'Verse'],['F',2,'Verse'],['G',1.5,'Chorus'],['N.C.',.5,'Chorus'],['C',2,'Chorus']]);
  assert.match(chart.notices[0], /practice assumption/);
});
test('ChordPro lyrics are not harmony, and 6/8 remains three quarter beats', () => {
  const chart = parseChordText('{time: 6/8}\n| [Cmaj7]a lyric [Am9]more |\na lyric-only line\n| [F]next |');
  assert.deepEqual(chart.steps.map(s => s.beats), [1.5,1.5,3]);
  assert.equal(chartChord('B♭Δ7/D'), 'Bbmaj7/D');
  assert.equal(chartChord('Cm(maj7)'), 'Cmmaj7');
});
test('invalid durations, unknown harmony, repeats and transpose are not silently guessed', () => {
  for (const source of ['C:0','C:-2','C:NaN','C:Infinity','C:257','C:2 G','|: C G :|','{transpose: 2}\nC','X','This is a melody','N.C.']) assert.throws(() => parseChordText(source), source);
  assert.throws(() => parseChordText('C '.repeat(1001)), /too long/);
  assert.throws(() => parseChordText('{tempo: 400}\nC'), /tempo/);
});
test('real MusicXML decoding keeps symbols, tempo, repeats and durations', () => {
  const score = load(xml), chart = parseScoreChords(alphaTab,score,chordParts(score)[0].id);
  assert.deepEqual(chart.steps.map(s => s.chord), ['C','G7','C','G7']);
  assert.deepEqual(chart.steps.map(s => s.beats), [4,4,4,4]);
  assert.equal(chart.bpm,96);
});
test('note-only XML cannot become a guessed chord progression', () => {
  const score = load(xml.replace(/<harmony>.*?<\/harmony>/g,''));
  assert.equal(chordParts(score).length,0);
  assert.throws(() => parseScoreChords(alphaTab,score,'0:0'), /No chord symbols/);
});
test('source diagrams keep actual strings and frets, without inventing finger numbers', () => {
  const score = load(xml), staff = score.tracks[0].staves[0];
  staff.stringTuning.tunings = [64,59,55,50,45,40];
  staff.bars[0].voices[0].beats[0].chord.strings = [12,13,12,14,15,-1];
  const chart = parseScoreChords(alphaTab,score,'0:0');
  assert.deepEqual(chart.steps[0].sourceShape.map(m => [m.string,m.fret,m.finger]), [[1,12,0],[2,13,0],[3,12,0],[4,14,0],[5,15,0]]);
  const exporter = new alphaTab.exporter.Gp7Exporter();
  const roundtrip = alphaTab.importer.ScoreLoader.loadScoreFromBytes(exporter.export(score, null));
  const gpChart = parseScoreChords(alphaTab,roundtrip,'0:0');
  assert.deepEqual(gpChart.steps.map(s => s.chord),chart.steps.map(s => s.chord));
  assert.deepEqual(gpChart.steps[0].sourceShape,chart.steps[0].sourceShape);
  staff.capo = 2;
  assert.equal(parseScoreChords(alphaTab,score,'0:0').steps[0].sourceShape,undefined);
});
// Small self-authored file for the actual browser import check (no third-party score).
fs.mkdirSync('verification/score-import',{recursive:true});
fs.writeFileSync('verification/score-import/repeat-chart.musicxml',xml);
test('excessive actual repeat expansion stops at the import bound', () => {
  const score = load(xml);
  score.masterBars[1].repeatCount = 5000;
  assert.throws(() => parseScoreChords(alphaTab,score,'0:0'), /too long/);
});
