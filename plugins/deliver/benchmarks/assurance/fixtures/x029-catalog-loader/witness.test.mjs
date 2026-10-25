import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './src/feature.mjs';
test('overlapping reads share a load', async () => {
  let calls=0; let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const get=createLoader(async()=>{calls++; await gate; return 42;});
  const a=get('a'); const b=get('a'); release();
  assert.deepEqual(await Promise.all([a,b]),[42,42]);
  assert.equal(calls,1);
});
