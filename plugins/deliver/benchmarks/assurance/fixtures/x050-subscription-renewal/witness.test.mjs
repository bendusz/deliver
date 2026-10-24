import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalDate } from './src/feature.mjs';
test('January renewal clamps to February', () => assert.equal(renewalDate('2024-01-31'),'2024-02-29'));
