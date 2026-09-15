import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voicingCandidates, connectVoicings, movementCost, shapeId } from '../lib/guitar-voicing.ts';
import { notePositions } from '../lib/practice-performance.ts';
const open = [0,64,59,55,50,45,40];
const pcs = shape => [...new Set(shape.map(m => (open[m.string]+m.fret)%12))].sort((a,b)=>a-b);
test('high-position suggestions preserve chord tones, slash basses and playable spread', () => {
  for (const [chord,expected] of [['C',[0,4,7]],['Dm9',[0,2,4,5]],['G13',[4,5,7,11]],['C/E',[0,4,7]]]) {
    const choices = voicingCandidates(chord,{min:8,max:17});
    assert.ok(choices.length,chord);
    for(const shape of choices) {
      assert.deepEqual(pcs(shape),expected,chord);
      assert.ok(shape.every(m=>m.fret>=8&&m.fret<=17));
      assert.equal(new Set(shape.map(m=>m.string)).size,shape.length);
      assert.ok(Math.max(...shape.map(m=>m.fret))-Math.min(...shape.map(m=>m.fret))<=3);
      if(chord==='C/E')assert.equal(Math.min(...shape.map(m=>open[m.string]+m.fret))%12,4);
    }
  }
  assert.deepEqual(voicingCandidates('unrecognized'),[]);
  assert.deepEqual(voicingCandidates('C/Db'),[]);
});
test('sequence optimization reduces movement and preserves pinned occurrences', () => {
  const choices = ['Dm9','G13','Cmaj9','A7b13'].map(chord=>voicingCandidates(chord,{min:5,max:17}));
  const optimized = connectVoicings(choices);
  const cost = shapes => shapes.slice(1).reduce((sum,shape,i)=>sum+movementCost(shapes[i],shape),0);
  assert.ok(cost(optimized)<=cost(choices.map(row=>row[0])));
  const pinned = choices[1].at(-1);
  assert.equal(shapeId(connectVoicings([choices[0],[pinned],choices[2]])[1]),shapeId(pinned));
  assert.deepEqual(connectVoicings([choices[0],[],choices[2]])[1],[]);
});
test('individual notes can move strings while keeping the exact octave and polyphony', () => {
  const midis=[64,67,71];
  const low=notePositions(midis,'standard',{min:0,max:5});
  const high=notePositions(midis,'standard',{min:8,max:17});
  assert.notEqual(shapeId(low),shapeId(high));
  for(const positions of [low,high]) {
    assert.equal(new Set(positions.map(m=>m.string)).size,3);
    assert.deepEqual(positions.map(m=>open[m.string]+m.fret).sort((a,b)=>a-b),midis);
  }
  assert.equal(notePositions([40],'standard',{min:8,max:17})[0].fret,0);
});
