import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoize } from './src/memo.mjs';

test('a single object argument equal by value hits the cache', () => {
  let calls = 0;
  const geohash = memoize((p) => { calls++; return `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`; });
  for (let i = 0; i < 50; i++) geohash({ lat: 52.37, lng: 4.9 });
  assert.equal(calls, 1);
});
