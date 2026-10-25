import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notifyPartners } from './src/partners.mjs';

test('a partner whose retry also fails is reported as failed', async () => {
  let attempts = 0;
  const post = async () => {
    attempts++;
    throw Object.assign(new Error('connect timeout'), { code: 'ETIMEDOUT' });
  };
  const out = await notifyPartners([{ id: 'p1', url: 'https://p1.test/hook' }], { type: 'order.paid' }, post);
  assert.equal(attempts, 2);
  assert.deepEqual(out, { delivered: [], failed: [{ id: 'p1', error: 'connect timeout' }] });
});
