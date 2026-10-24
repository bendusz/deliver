import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRenewal } from './src/subscriptions.mjs';

test('month-end starts renew on the last day of short months', () => {
  assert.equal(nextRenewal('2024-01-31', 'monthly'), '2024-02-29');
  assert.equal(nextRenewal('2023-01-31', 'monthly'), '2023-02-28');
  assert.equal(nextRenewal('2024-01-31', 'monthly', 2), '2024-03-31');
  assert.equal(nextRenewal('2024-02-29', 'yearly'), '2025-02-28');
});
