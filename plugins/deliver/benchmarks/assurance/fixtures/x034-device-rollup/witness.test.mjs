import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueDevices } from './src/feature.mjs';
test('distinct devices use a bounded number of key reads', () => {
  let reads=0; const n=600;
  const events=Array.from({length:n},(_,i)=>({get deviceId(){reads++; return String(i);}}));
  assert.equal(uniqueDevices(events).length,n);
  assert.ok(reads <= n*10, `key reads: ${reads}`);
});
