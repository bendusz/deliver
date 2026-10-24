import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserve } from './src/inventory.mjs';

test('the last units cannot be sold twice', () => {
  const stock = new Map([['lamp', { onHand: 5, reserved: 0 }]]);
  reserve(stock, 'lamp', 3);
  assert.throws(() => reserve(stock, 'lamp', 3), { code: 'EINSUFFICIENT' });
  assert.equal(stock.get('lamp').reserved, 3);
});
