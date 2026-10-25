import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movingAverage } from './src/series.mjs';

test('each point is read a constant number of times', () => {
  let reads = 0;
  const data = Array.from({ length: 5000 }, (_, i) => i % 17);
  const series = new Proxy(data, {
    get(target, prop) {
      if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
      return target[prop];
    },
  });
  const out = movingAverage(series, 500);
  assert.equal(out.length, 4501);
  assert.ok(reads <= 4 * data.length, `${reads} reads for ${data.length} points`);
});
