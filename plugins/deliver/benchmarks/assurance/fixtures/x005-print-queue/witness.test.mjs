import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dequeue } from './src/feature.mjs';
test('oldest job dispatches first', () => { const q=[{id:1},{id:2}]; assert.deepEqual(dequeue(q),{id:1}); assert.deepEqual(q,[{id:2}]); });
