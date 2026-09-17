import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerMotionDuration, reconcileFingers, restingFinger, sampleFingerMotion } from '../lib/finger-motion.ts';

const contact = (string, fret, finger, interval = 'R') => ({ string, fret, finger, interval });
const initialTracks = markers => reconcileFingers({ tracks: [], nextId: 0 }, markers, true);
const sample = (before, after, progress, from = restingFinger(.2, .3), to = restingFinger(.7, .8)) =>
  sampleFingerMotion(from, to, before, after, progress);

test('a known finger keeps its identity when moving to another string', () => {
  const before = initialTracks([contact(2, 5, 1), contact(4, 7, 3)]);
  const after = reconcileFingers(before, [contact(3, 8, 3), contact(1, 6, 1)]);
  assert.equal(after.tracks[0].id, before.tracks[1].id);
  assert.equal(after.tracks[1].id, before.tracks[0].id);
  assert.ok(after.tracks.every(track => !track.entering));
  assert.equal(after.nextId, before.nextId);
});

test('unchanged barre contacts are reserved before assigning a moving endpoint', () => {
  const held = contact(2, 5, 1);
  const released = contact(6, 5, 1);
  const before = initialTracks([held, released, contact(4, 7, 3)]);
  // The new contact is nearer the held contact. It must still use the released
  // endpoint, even when it appears first in the target shape.
  const after = reconcileFingers(before, [contact(1, 5, 1), { ...held, interval: '5' }, contact(4, 7, 3)]);
  assert.equal(after.tracks[0].id, before.tracks[1].id);
  assert.equal(after.tracks[1].id, before.tracks[0].id);
  assert.equal(after.tracks[2].id, before.tracks[2].id);
});

test('repeated finger numbers and repeated contacts always have distinct marker identities', () => {
  let state = initialTracks([contact(1, 5, 1), contact(2, 5, 1), contact(2, 5, 1)]);
  const transitions = [
    [contact(2, 5, 1), contact(3, 5, 1), contact(2, 5, 1), contact(4, 5, 1)],
    [contact(4, 7, 1), contact(3, 7, 1), contact(2, 7, 1)],
    [contact(1, 8, 2), contact(2, 8, 2), contact(3, 8, 2), contact(4, 8, 2)],
  ];
  for (const markers of transitions) {
    state = reconcileFingers(state, markers);
    const ids = state.tracks.map(track => track.id);
    assert.equal(new Set(ids).size, markers.length);
    assert.ok(ids.every(id => id < state.nextId));
    assert.deepEqual(state.tracks.map(track => track.marker), markers);
  }
});

test('a replacement finger at the same string and fret gets a new identity', () => {
  const before = initialTracks([contact(2, 5, 1)]);
  const after = reconcileFingers(before, [contact(2, 5, 2)]);
  assert.notEqual(after.tracks[0].id, before.tracks[0].id);
  assert.equal(after.tracks[0].entering, true);
});

test('unknown fingers and open strings never invent a moving physical finger', () => {
  for (const [beforeMarker, afterMarker] of [
    [contact(2, 5, 0), contact(1, 7, 0)],
    [contact(2, 0, 0), contact(1, 0, 0)],
    [contact(2, 5, 1), contact(2, 0, 1)],
  ]) {
    const before = initialTracks([beforeMarker]);
    const after = reconcileFingers(before, [afterMarker]);
    assert.notEqual(after.tracks[0].id, before.tracks[0].id);
    const pose = sample(beforeMarker, afterMarker, .5);
    assert.equal(pose.lift, 0);
    assert.equal(pose.roll, 0);
    assert.equal(pose.pressure, 1);
    assert.equal(pose.scaleX, 1);
    assert.equal(pose.scaleY, 1);
  }
});

test('a rest removes every contact and the following chord starts fresh identities', () => {
  const markers = [contact(1, 5, 1), contact(4, 7, 3), contact(6, 0, 0)];
  const before = initialTracks(markers);
  assert.ok(before.tracks.every(track => !track.entering));
  const rest = reconcileFingers(before, []);
  assert.deepEqual(rest.tracks, []);
  assert.equal(rest.nextId, before.nextId);
  const after = reconcileFingers(rest, markers);
  assert.ok(after.tracks.every(track => track.entering && track.id >= rest.nextId));
});

test('all fingers land exactly at the endpoint within the same total motion budget', () => {
  for (const seconds of [0, .02, .1, .3, .48, 1, 10]) {
    const budget = fingerMotionDuration(seconds);
    assert.ok(budget >= 0 && budget <= seconds && budget <= .48);
  }
  assert.equal(fingerMotionDuration(-1), 0);
  for (let finger = 1; finger <= 4; finger += 1) {
    const before = contact(6, 3, finger), after = contact(1, 12, finger);
    const from = restingFinger(.1, .9), to = restingFinger(.9, .1);
    assert.deepEqual(sample(before, after, 0, from, to), from);
    assert.deepEqual(sample(before, after, 1, from, to), to);
    assert.deepEqual(sample(before, after, -1, from, to), from);
    assert.deepEqual(sample(before, after, 2, from, to), to);
    assert.ok(Math.abs(sample(before, after, .999999, from, to).lift) < .001);
  }
});

test('finger staggering stays inside the shared budget and does not delay the final landing', () => {
  const from = restingFinger(.1, .5), to = restingFinger(.8, .5);
  const index = sample(contact(3, 3, 1), contact(3, 8, 1), .2, from, to);
  const little = sample(contact(3, 3, 4), contact(3, 8, 4), .2, from, to);
  assert.ok(index.x > little.x, 'index finger should lead the little finger');
  assert.deepEqual(sample(contact(3, 3, 4), contact(3, 8, 4), .1, from, to), from);
  assert.deepEqual(sample(contact(3, 3, 4), contact(3, 8, 4), 1, from, to), to);
});

test('held contacts stay planted without lift, roll, squeeze or bounce', () => {
  const held = contact(2, 5, 1);
  const pose = restingFinger(.35, .6);
  for (const progress of [0, .05, .2, .5, .8, .95, 1]) {
    assert.deepEqual(sample(held, { ...held, interval: '5' }, progress, pose, pose), pose);
  }
});

test('a viewport reprojection of an anchored contact has no hand-motion embellishment', () => {
  const held = contact(6, 8, 1);
  const from = restingFinger(.1, .8), to = restingFinger(.6, .3);
  const middle = sample(held, held, .5, from, to);
  assert.ok(middle.x > from.x && middle.x < to.x);
  assert.ok(middle.y < from.y && middle.y > to.y);
  assert.deepEqual({ ...middle, x: to.x, y: to.y }, to);
});

test('a cross-string shift visibly releases pressure and lifts farther than a same-string slide', () => {
  const before = contact(2, 5, 1);
  const slide = sample(before, contact(2, 7, 1), .5);
  const crossing = sample(before, contact(4, 7, 1), .5);
  assert.ok(Math.abs(crossing.lift) > Math.abs(slide.lift));
  assert.ok(Math.abs(crossing.roll) > Math.abs(slide.roll));
  assert.ok(crossing.pressure < 1);
  assert.ok(crossing.scaleX > 1 && crossing.scaleY < 1);
  assert.ok(crossing.x > .2 && crossing.x < .7);
});

test('outer-string lifts point inward so the contact does not leave the neck', () => {
  assert.ok(sample(contact(2, 5, 1), contact(1, 7, 1), .5).lift > 0);
  assert.ok(sample(contact(5, 5, 1), contact(6, 7, 1), .5).lift < 0);
});

test('an interrupted move starts at the current lifted pose and finishes at the new target', () => {
  const first = contact(1, 3, 4), middle = contact(4, 7, 4), last = contact(2, 12, 4);
  const interrupted = sample(first, middle, .48);
  const target = restingFinger(.9, .2);
  assert.notEqual(interrupted.lift, 0);
  assert.notEqual(interrupted.roll, 0);
  assert.deepEqual(sample(middle, last, 0, interrupted, target), interrupted);
  const justStarted = sample(middle, last, .000001, interrupted, target);
  for (const key of Object.keys(target)) {
    assert.ok(Math.abs(justStarted[key] - interrupted[key]) < .001, `interrupted ${key} must not jump`);
  }
  for (const progress of [.1, .3, .5, .7, .9]) {
    const pose = sample(middle, last, progress, interrupted, target);
    assert.ok(Object.values(pose).every(Number.isFinite));
    assert.ok(pose.opacity >= 0 && pose.opacity <= 1);
    assert.ok(pose.pressure >= 0 && pose.pressure <= 1);
  }
  assert.deepEqual(sample(middle, last, 1, interrupted, target), target);
});

test('a newly entering finger settles from a transparent pose without moving another contact', () => {
  const after = contact(3, 5, 2);
  const target = restingFinger(.5, .5);
  const from = { ...target, opacity: 0 };
  const middle = sample(null, after, .45, from, target);
  assert.equal(middle.x, target.x);
  assert.equal(middle.y, target.y);
  assert.ok(middle.opacity > 0 && middle.opacity <= 1);
  assert.notEqual(middle.lift, 0);
  assert.deepEqual(sample(null, after, 1, from, target), target);
});
