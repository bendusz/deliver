import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notifyAll } from './src/feature.mjs';
test('partial delivery rejects with its reasons', async () => {
  const failure=new Error('mailbox unavailable');
  await assert.rejects(notifyAll(['a','b'],async m=>{if(m==='b')throw failure; return m;}),e=>e instanceof AggregateError && e.errors.length===1 && e.errors[0]===failure);
});
