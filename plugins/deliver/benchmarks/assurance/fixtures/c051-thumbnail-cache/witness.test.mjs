import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LruCache } from './src/lru.mjs';

test('replacing a value counts as a use', () => {
  const c = new LruCache(2);
  c.set('a', 1);
  c.set('b', 2);
  c.set('a', 10);
  c.set('c', 3);
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 10);
  assert.equal(c.size, 2);
});
