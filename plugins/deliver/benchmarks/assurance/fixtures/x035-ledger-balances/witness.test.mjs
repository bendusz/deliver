import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runningBalances } from './src/feature.mjs';
test('ledger scan is linear in amount reads', () => {
  let reads=0; const n=700;
  const rows=Array.from({length:n},()=>({get amount(){reads++; return 1;}}));
  assert.equal(runningBalances(rows).at(-1),n);
  assert.ok(reads <= n*10, `amount reads: ${reads}`);
});
