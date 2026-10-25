import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount } from './src/money.mjs';

test('amounts convert to exact cents', () => {
  assert.equal(parseAmount('19.99'), 1999);
  assert.equal(parseAmount('0.29'), 29);
  assert.equal(parseAmount('-4.35'), -435);
});
