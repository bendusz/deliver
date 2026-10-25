import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listQuery } from './src/feature.mjs';
test('reject unrecognized identifier', () => assert.throws(() => listQuery('t','name; DROP TABLE accounts'),RangeError));
