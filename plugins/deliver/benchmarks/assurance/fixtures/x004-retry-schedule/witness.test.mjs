import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryDelay } from './src/feature.mjs';
test('first attempt uses initial delay', () => assert.equal(retryDelay(1, 100, 1000), 100));
