import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from './src/feature.mjs';
test('client failure is not parsed as success', async () => {
  let decoded=0;
  await assert.rejects(readApiResponse({status:404,json:async()=>{decoded++; return {error:'missing'};}}),{status:404});
  assert.equal(decoded,0);
});
