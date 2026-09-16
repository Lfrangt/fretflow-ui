const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(name) {
  const filename = path.join(__dirname, '../lib', name + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: dependency =>
    require(path.join(__dirname, '..', dependency.replace(/^@\//, ''))) }, { filename });
  return module.exports;
}

const { dreamGuitars } = load('dream-guitars');
const { fretboardScrollTarget, guitarLayout, mobileFocusLayout, PRACTICE_FRET_COUNT, rightHandedStringPosition } = load('guitar-layout');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('right-handed horizontal fretboards put the treble strings above the bass, like TAB', () => {
  const openD = [
    { string: 4, fret: 0, midi: 50 }, { string: 3, fret: 2, midi: 57 },
    { string: 2, fret: 3, midi: 62 }, { string: 1, fret: 2, midi: 66 }
  ];
  const topToBottom = [...openD].sort((a, b) => rightHandedStringPosition(a.string) - rightHandedStringPosition(b.string));
  assert.deepEqual(topToBottom.map(note => note.midi), [66, 62, 57, 50]);
  close(rightHandedStringPosition(1), 0);
  close(rightHandedStringPosition(6), 1);
});

test('every guitar keeps its rotated photo and learning neck on the same string axis', () => {
  for (const guitar of dreamGuitars) {
    const sourceAxis = guitar.legacy ? .218 : guitar.family === 'Jazzmaster' ? .167 : .163;
    // The source photo has its headstock on the right. Turning it 180 degrees
    // preserves handedness and moves its string axis to imageHeight - sourceY.
    close(guitar.centerY, 1 / guitar.aspect - sourceAxis);
    for (const layout of [
      guitarLayout(guitar, false, false), guitarLayout(guitar, true, false),
      guitarLayout(guitar, true, false, true), guitarLayout(guitar, true, true, true),
      mobileFocusLayout(guitar, 390, 330, 17)
    ]) {
      close(layout.photoY + layout.photoWidth * guitar.centerY, layout.neckY + layout.neckHeight / 2);
      if (layout.joined) close(layout.photoX + layout.photoWidth * guitar.joinX, layout.neckX + layout.neckWidth + layout.jointWidth);
    }
  }
});

function phoneCamera(viewportWidth, frets, scrollLeft = 0) {
  const layout = mobileFocusLayout(dreamGuitars[0], viewportWidth, 330, PRACTICE_FRET_COUNT);
  const camera = { frets, scrollLeft, viewportWidth, contentWidth: layout.width,
    gridX: layout.neckX + 14, fretWidth: (layout.neckWidth - 14) / PRACTICE_FRET_COUNT };
  return { ...camera, target: fretboardScrollTarget(camera) };
}

test('phone camera follows frets 15–17 with neighbouring fret context at narrow widths', () => {
  for (const width of [292, 347, 362, 402, 812]) {
    const camera = phoneCamera(width, [15, 16, 17]);
    assert.ok(camera.target > 0, 'high positions must move the viewport');
    const left = camera.gridX + 14.5 * camera.fretWidth - camera.target;
    const right = camera.gridX + 16.5 * camera.fretWidth - camera.target;
    assert.ok(left >= camera.fretWidth, `left context at ${width}px`);
    assert.ok(right <= width - camera.fretWidth, `right context at ${width}px`);
    assert.ok(camera.target <= camera.contentWidth - width);
  }
});

test('nearby chord changes hold the camera still; a position shift pans and can return', () => {
  const first = phoneCamera(362, [8, 10]);
  const nearby = phoneCamera(362, [7, 10], first.target);
  close(nearby.target, first.target);
  const high = phoneCamera(362, [15, 17], nearby.target);
  assert.ok(high.target > nearby.target);
  const low = phoneCamera(362, [1, 3], high.target);
  close(low.target, 0);
});

test('rotation rechecks visibility, silence preserves framing, and neck ends clamp safely', () => {
  const landscape = phoneCamera(812, [15, 17]);
  const portrait = phoneCamera(292, [15, 17], landscape.target);
  assert.ok(portrait.target > landscape.target);
  close(phoneCamera(292, [], portrait.target).target, portrait.target);
  close(phoneCamera(292, [0, 1, 2]).target, 0);
  const end = phoneCamera(292, [20, 21]);
  close(end.target, end.contentWidth - end.viewportWidth);
  close(phoneCamera(1200, [15, 17]).target, 0);
});
