import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitInvoice } from './src/feature.mjs';
test('publish waits for persistence', async () => {
  let release; let persisted=false; const observations=[];
  const gate=new Promise(resolve=>{release=resolve;});
  const pending=submitInvoice({id:'i'},{save:async()=>{await gate; persisted=true;}},{publish:async()=>{observations.push(persisted);}});
  release(); await pending;
  assert.deepEqual(observations,[true]);
});
