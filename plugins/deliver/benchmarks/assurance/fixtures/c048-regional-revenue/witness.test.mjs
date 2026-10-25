import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revenueByRegion } from './src/report.mjs';

test('work grows linearly with orders plus customers', () => {
  let reads = 0;
  const customers = Array.from({ length: 2000 }, (_, i) => ({ get id() { reads++; return i; }, region: i % 2 ? 'emea' : 'apac' }));
  const orders = Array.from({ length: 3000 }, (_, i) => ({ id: i, customerId: (i * 7) % 2000, status: 'paid', totalCents: 1 }));
  const totals = revenueByRegion(orders, customers);
  assert.equal(totals.emea + totals.apac, 3000);
  assert.ok(reads <= 5 * (orders.length + customers.length), `${reads} customer id reads`);
});
