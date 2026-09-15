import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundingMidi, midiName, notePositions } from '../lib/practice-performance.ts';
test('sounding notes retain polyphonic sustains, stop at note-off, and leave rests empty', () => {
 const d={notes:[{start:0,end:1,midi:60},{start:.3,end:.6,midi:64},{start:.5,end:.8,midi:60}]};
 assert.deepEqual(soundingMidi(d,.4),[60,64]);assert.deepEqual(soundingMidi(d,.65),[60]);assert.deepEqual(soundingMidi(d,1),[]);assert.equal(midiName(61),'C♯4');
});
test('visible string/fret suggestions produce the exact sounding pitches on unique strings', () => {
 const midis=[45,52,57,61,64];const result=notePositions(midis);const open=[0,64,59,55,50,45,40];
 assert.equal(result.length,midis.length);assert.equal(new Set(result.map(p=>p.string)).size,result.length);
 for(const p of result){assert.equal(open[p.string]+p.fret,p.midi);assert.ok(p.fret>=0&&p.fret<=12);}
});
test('out-of-range notes stay unplaced instead of being shifted to another octave', () => {
 const positions=notePositions([37,45,88]);assert.deepEqual(positions.map(p=>p.midi),[45]);
 assert.equal(notePositions([84])[0].fret,20); // High positions are visible now; the octave stays unchanged.
 assert.deepEqual(notePositions([38]),[]);assert.equal(notePositions([38],'drop-d')[0].fret,0);
});
test('upper-position melody uses an open A bass instead of pulling both notes down the neck', () => {
 const result=notePositions([45,52,64],'standard',{min:8,max:17});
 assert.deepEqual(result.map(p=>[p.midi,p.string,p.fret]),[[45,5,0],[52,6,12],[64,4,14]]);
 assert.deepEqual(notePositions([64,45,52],'standard',{min:8,max:17}),result);
});
test('upper-position suggestions retain unavoidable low notes at their true octave', () => {
 const result=notePositions([43,62,66],'standard',{min:8,max:17});
 assert.equal(result.find(p=>p.midi===43).fret,3);
 assert.ok(result.filter(p=>p.midi>43).every(p=>p.fret>=8&&p.fret<=17));
 assert.deepEqual(notePositions([]),[]);
});
