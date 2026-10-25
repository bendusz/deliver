import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from './src/timeouts.mjs';

test('typos fail instead of becoming a different timeout', () => {
  assert.throws(() => parseDuration('5x'), SyntaxError);
  assert.throws(() => parseDuration('1h30'), SyntaxError);
  assert.throws(() => parseDuration('30m1h'), SyntaxError);
  assert.equal(parseDuration('1h30m'), 5400);
});
