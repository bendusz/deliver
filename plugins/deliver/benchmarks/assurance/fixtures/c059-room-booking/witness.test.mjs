import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, book } from './src/rooms.mjs';

test('a meeting may start when the previous one ends', () => {
  const H = 3600000;
  const first = { roomId: 'atlas', start: 9 * H, end: 10 * H };
  assert.equal(overlaps(first, { roomId: 'atlas', start: 10 * H, end: 11 * H }), false);
  assert.equal(book([first], { roomId: 'atlas', start: 10 * H, end: 11 * H }).length, 2);
});
