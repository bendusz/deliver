import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from './src/feature.mjs';
test('second import waits for first', async () => {
  const submit=createWorker(); let release; let firstDone=false;
  const gate=new Promise(resolve=>{release=resolve;});
  const first=submit(async()=>{await gate; firstDone=true;});
  const second=submit(async()=>firstDone);
  release(); await first;
  assert.equal(await second,true);
});
