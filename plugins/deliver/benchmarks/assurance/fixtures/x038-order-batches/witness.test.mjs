import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerBatches } from './src/feature.mjs';
test('grouping avoids one full scan per customer', () => {
  let reads=0; const n=600;
  const orders=Array.from({length:n},(_,i)=>({get customer(){reads++; return String(i);}}));
  assert.equal(customerBatches(orders).length,n);
  assert.ok(reads <= n*10, `customer reads: ${reads}`);
});
