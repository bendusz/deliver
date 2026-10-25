import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceTotals } from './src/invoice.mjs';

test('VAT is rounded once on the subtotal', () => {
  const lines = [
    { description: 'Coffee', quantity: 1, unitCents: 250 },
    { description: 'Tea', quantity: 1, unitCents: 250 },
  ];
  assert.deepEqual(invoiceTotals(lines, 2100), { subtotalCents: 500, vatCents: 105, totalCents: 605 });
});
