import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile } from './src/metrics.mjs';

test('a fractional rank rounds up', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => (i + 1) * 10);
  assert.equal(percentile(twelve, 95), 120);
  assert.equal(percentile([5, 1, 3, 2, 4], 25), 2);
});
