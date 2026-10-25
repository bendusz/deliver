import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchReport } from './src/feature.mjs';
test('permanent failures are not retried', async () => {
  let calls=0; const error=Object.assign(new Error('invalid credentials'),{code:'EAUTH'});
  await assert.rejects(fetchReport(async()=>{calls++; throw error;}),e=>e===error);
  assert.equal(calls,1);
});
