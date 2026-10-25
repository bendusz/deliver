import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents } from './src/feature.mjs';
test('two decimal places remain exact', () => assert.equal(toCents('1.15'),115));
