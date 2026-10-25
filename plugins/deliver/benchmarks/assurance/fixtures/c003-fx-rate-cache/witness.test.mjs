import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateCache } from './src/rate-cache.mjs';

test('concurrent lookups share one provider call', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const cache = createRateCache(async () => { calls++; await gate; return { USD: 1.08 }; }, { now: () => 0 });
  const lookups = [cache.get('EUR'), cache.get('EUR'), cache.get('EUR')];
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const results = await Promise.all(lookups);
  assert.deepEqual(results[2], { USD: 1.08 });
  assert.equal(calls, 1);
});
