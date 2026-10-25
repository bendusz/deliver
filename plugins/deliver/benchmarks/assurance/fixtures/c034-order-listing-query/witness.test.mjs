import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listOrdersQuery } from './src/orders-query.mjs';

test('a single status goes through a placeholder', () => {
  const evil = "paid' OR '1'='1";
  const q = listOrdersQuery({ status: evil });
  assert.ok(!q.text.includes(evil));
  assert.match(q.text, /WHERE status = \$1 /);
  assert.deepEqual(q.values, [evil, 50, 0]);
});
