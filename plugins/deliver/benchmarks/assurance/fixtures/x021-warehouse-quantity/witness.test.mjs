import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampQuantity } from './src/feature.mjs';
test('negative stock is clamped to zero', () => assert.equal(clampQuantity(-3,20),0));
