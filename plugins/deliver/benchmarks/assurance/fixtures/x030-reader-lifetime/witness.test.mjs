import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withReader } from './src/feature.mjs';
test('async consumption retains an open reader', async () => {
  let closed=false;
  const result=await withReader(async()=>({close:async()=>{closed=true;}}),async()=>{await Promise.resolve(); return !closed;});
  assert.equal(result,true); assert.equal(closed,true);
});
