import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb, transaction } from './src/db.mjs';

test('the caller sees the error after the rollback', async () => {
  const db = new FakeDb();
  const err = new Error('insufficient funds');
  await assert.rejects(transaction(db, async () => { throw err; }), (e) => e === err);
  assert.deepEqual(db.log, ['BEGIN', 'ROLLBACK']);
});
