import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginateBlocks } from '../lib/pdf-layout.ts';

test('PDF pagination keeps complete rows/systems and retains every item exactly once', () => {
  const sizes = [50, 150, 80, 30, 90];
  const pages = paginateBlocks(sizes, 200);
  assert.deepEqual(pages, [[0, 1], [2, 3, 4]]);
  assert.deepEqual(pages.flat(), sizes.map((_, i) => i));
  for (const page of pages) assert.ok(page.reduce((sum, i) => sum + sizes[i], 0) <= 200);
});
test('oversized or invalid systems produce an error instead of clipped exports', () => {
  for (const sizes of [[201], [NaN], [-1], [0]]) assert.throws(() => paginateBlocks(sizes, 200));
  assert.deepEqual(paginateBlocks([], 200), []);
});
