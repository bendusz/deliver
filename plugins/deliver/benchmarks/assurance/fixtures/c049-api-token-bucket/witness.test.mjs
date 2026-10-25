import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket } from './src/bucket.mjs';

test('an idle client still gets at most capacity in a burst', () => {
  const b = new TokenBucket({ capacity: 20, refillPerSec: 5 }, 0);
  let passed = 0;
  for (let i = 0; i < 100; i++) if (b.tryTake(10000)) passed++;
  assert.equal(passed, 20);
});
