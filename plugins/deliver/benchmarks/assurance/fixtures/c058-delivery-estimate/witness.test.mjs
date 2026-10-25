import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessDays, estimateDelivery } from './src/shipping.mjs';

test('holidays do not count as business days', () => {
  assert.equal(estimateDelivery('2024-12-24', 2), '2024-12-30');
  assert.equal(addBusinessDays('2024-12-30', 3, ['2025-01-01']), '2025-01-03');
});
