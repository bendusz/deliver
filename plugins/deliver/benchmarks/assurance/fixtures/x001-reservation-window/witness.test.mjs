import { test } from 'node:test';
import assert from 'node:assert/strict';
import { available } from './src/feature.mjs';
test('successive bookings can share an endpoint', () => {
  assert.equal(available([{start: 10, end: 20}], 20, 30), true);
});
