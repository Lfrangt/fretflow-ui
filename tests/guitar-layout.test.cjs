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
const { fretCell, fretDistance, photoMarkerPosition, fretboardWindow, fretboardScrollTarget, guitarLayout, mobileFocusLayout, PRACTICE_FRET_COUNT, rightHandedStringPosition } = load('guitar-layout');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('photo C shape lands on measured strings instead of above the photographed neck', () => {
  const guitar = dreamGuitars[0];
  // Pixel landmarks in the actual rotated 2700 x 1040 photo, near frets 8–10.
  for (const [string, fret, x, y] of [[1, 8, 1143, 394], [2, 8, 1143, 416], [3, 9, 1207, 439], [4, 10, 1267, 462]]) {
    const position = photoMarkerPosition(guitar, string, fret);
    assert.ok(Math.abs(position.x * 2700 - x) < 3, `string ${string} fret position`);
    assert.ok(Math.abs(position.y * 1040 - y) < 2, `string ${string} photograph axis`);
  }
});

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
    gridX: layout.neckX + 14, gridWidth: layout.neckWidth - 14, fretCount: PRACTICE_FRET_COUNT };
  return { ...camera, target: fretboardScrollTarget(camera) };
}

test('phone camera follows frets 15–17 with neighbouring fret context at narrow widths', () => {
  for (const width of [292, 347, 362, 402, 812]) {
    const camera = phoneCamera(width, [15, 16, 17]);
    assert.ok(camera.target > 0, 'high positions must move the viewport');
    const left = camera.gridX + fretCell(15).center * camera.gridWidth - camera.target;
    const right = camera.gridX + fretCell(17).center * camera.gridWidth - camera.target;
    assert.ok(left >= 40, `left context at ${width}px`);
    assert.ok(right <= width - 40, `right context at ${width}px`);
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
  assert.ok(low.target < high.target);
  assert.ok(low.gridX + fretCell(1).center * low.gridWidth - low.target >= 14);
});

test('rotation rechecks visibility, silence preserves framing, and neck ends clamp safely', () => {
  const landscape = phoneCamera(812, [15, 17]);
  const portrait = phoneCamera(292, [15, 17], landscape.target);
  assert.ok(portrait.target > landscape.target);
  close(phoneCamera(292, [], portrait.target).target, portrait.target);
  close(phoneCamera(292, [0, 1, 2]).target, 0);
  const end = phoneCamera(292, [20, 21]);
  close(end.target, end.contentWidth - end.viewportWidth);
  close(phoneCamera(1400, [15, 17]).target, 0);
});


test('fret geometry uses equal temperament, with each octave halving cell width', () => {
  close(fretDistance(0), 0);
  close(fretDistance(12), .5);
  close(fretDistance(24), .75);
  for (const count of [17, 21, 24]) {
    let width = 0;
    for (let fret = 1; fret <= count; fret++) {
      const cell = fretCell(fret, count);
      assert.ok(cell.start < cell.center && cell.center < cell.end);
      close(cell.center, (cell.start + cell.end) / 2);
      if (fret > 1) close(cell.width / fretCell(fret - 1, count).width, 2 ** (-1 / 12));
      if (fret > 12) close(cell.width / fretCell(fret - 12, count).width, .5);
      width += cell.width;
    }
    close(width, 1);
  }
});

test('phone high frets remain readable and a four-fret low shape fits a 300px viewport', () => {
  const camera = phoneCamera(300, [1, 2, 3, 4]);
  assert.ok(fretCell(21).width * camera.gridWidth >= 30 - 1e-9);
  const left = camera.gridX + fretCell(1).center * camera.gridWidth - camera.target;
  const right = camera.gridX + fretCell(4).center * camera.gridWidth - camera.target;
  assert.ok(left >= 14);
  assert.ok(right <= 300 - 14);
});

test('desktop camera holds nearby shapes, frames high positions, and preserves rests', () => {
  const initial = { first: 1, last: 8 };
  assert.equal(fretboardWindow([3, 5, 6], initial), initial);
  const middle = fretboardWindow([8, 10], initial);
  assert.ok(middle.first <= 7 && middle.last >= 11);
  assert.equal(fretboardWindow([7, 10], middle), middle);
  const high = fretboardWindow([15, 16, 17], middle);
  assert.ok(high.first < 15 && high.last > 17);
  assert.equal(high.last - high.first + 1, 8);
  assert.equal(fretboardWindow([], high), high);
  const end = fretboardWindow([20, 21], high);
  assert.equal(end.last, 21);
  const low = fretboardWindow([0, 1, 3], end);
  assert.equal(low.first, 1);
  const wide = fretboardWindow([1, 17], initial);
  assert.ok(wide.first <= 1 && wide.last >= 17);
});
