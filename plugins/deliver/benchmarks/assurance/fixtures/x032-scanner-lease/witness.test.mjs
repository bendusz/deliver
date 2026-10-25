import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLease } from './src/feature.mjs';
test('pending acquisition excludes another caller', async () => {
  let opens=0;
  const lease=createLease(async()=>{opens++; await Promise.resolve(); return {id:opens};});
  const results=await Promise.all([lease.acquire(),lease.acquire()]);
  assert.equal(opens,1); assert.equal(results[1],null);
});
