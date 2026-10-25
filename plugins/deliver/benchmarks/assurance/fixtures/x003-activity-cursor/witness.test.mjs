import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takePage } from './src/feature.mjs';
test('resume after a row', () => assert.deepEqual(takePage([{id:'a'}, {id:'b'}], 'a', 2), [{id:'b'}]));
