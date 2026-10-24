import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPreferences } from './src/feature.mjs';
test('permission failures reach the caller', async () => {
  const error=Object.assign(new Error('denied'),{code:'EACCES'});
  await assert.rejects(readPreferences(async()=>{throw error;}), e=>e===error);
});
