import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEvenly } from './src/expenses.mjs';

test('shares add up to the amount, extra cents first', () => {
  assert.deepEqual(splitEvenly(1000, 3), [334, 333, 333]);
  assert.deepEqual(splitEvenly(200, 3), [67, 67, 66]);
});
