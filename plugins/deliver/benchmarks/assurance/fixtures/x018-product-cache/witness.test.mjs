import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from './src/feature.mjs';
test('invalidation removes the cached item', () => { const c=createCache(); c.set('a',1); assert.equal(c.invalidate('a'),true); assert.equal(c.get('a'),undefined); });
