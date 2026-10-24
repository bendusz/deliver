import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from './src/store.mjs';
import { issueResetToken, redeemResetToken } from './src/reset.mjs';

test('a token works exactly once', async () => {
  const store = new MemoryStore();
  const token = await issueResetToken(store, 'u7', 0);
  assert.equal(await redeemResetToken(store, token, 60000), 'u7');
  assert.equal(await redeemResetToken(store, token, 61000), null);
});
