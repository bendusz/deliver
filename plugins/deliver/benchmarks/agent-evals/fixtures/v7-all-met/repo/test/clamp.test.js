import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from '../src/clamp.js';

test('clamp bounds the value', () => {
  assert.equal(clamp(0), 1);
  assert.equal(clamp(9), 5);
  assert.equal(clamp(3), 3);
});

test('clamp rejects a non-number', () => {
  assert.throws(() => clamp('x'), TypeError);
});
