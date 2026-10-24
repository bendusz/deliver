import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeduper } from './src/webhooks.mjs';

test('expired ids are dropped as time moves on', () => {
  const d = createDeduper(1000);
  for (let i = 0; i < 10000; i++) d.seen(`evt-${i}`, i * 10);
  assert.ok(d.size <= 100, `holding ${d.size} ids`);
  assert.equal(d.seen('evt-9999', 100000), true);
});
