import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from './src/remote.mjs';

test('the timer is cancelled when the call rejects', async () => {
  const pending = new Set();
  let next = 1;
  const timers = {
    setTimeout() { const id = next++; pending.add(id); return id; },
    clearTimeout(id) { pending.delete(id); },
  };
  await withTimeout(Promise.reject(new Error('unknown sku')), 5000, timers).catch(() => {});
  assert.equal(pending.size, 0);
});
