import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageCount, pageOf } from './src/list.mjs';

test('a partial last page counts as a page and is returned', () => {
  const items = Array.from({ length: 11 }, (_, i) => ({ title: `t${i}` }));
  assert.equal(pageCount(11, 5), 3);
  assert.equal(pageCount(0, 5), 0);
  assert.deepEqual(pageOf(items, 3, 5).map((x) => x.title), ['t10']);
});
