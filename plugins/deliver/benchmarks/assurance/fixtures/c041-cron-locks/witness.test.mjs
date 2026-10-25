import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LockManager, withLock } from './src/locks.mjs';

test('a failed job does not keep the lock', async () => {
  const locks = new LockManager();
  await withLock(locks, 'nightly', async () => { throw new Error('upstream timeout'); }).catch(() => {});
  assert.equal(locks.held.has('nightly'), false);
  assert.equal(await withLock(locks, 'nightly', async () => 'second run'), 'second run');
});
