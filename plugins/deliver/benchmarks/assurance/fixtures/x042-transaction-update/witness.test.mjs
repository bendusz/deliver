import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateTransaction } from './src/feature.mjs';
test('cleanup cannot replace the write failure', async () => {
  const writeError=new Error('write'); const cleanupError=new Error('cleanup');
  await assert.rejects(updateTransaction(async()=>{throw writeError;},async()=>{throw cleanupError;}),e=>e===writeError);
});
