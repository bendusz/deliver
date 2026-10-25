import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendDigest } from './src/feature.mjs';
test('completion includes delayed deliveries', async () => {
  let release; let finished=false;
  const gate=new Promise(resolve=>{release=resolve;});
  const pending=sendDigest(['a'],async()=>{await gate;}).then(()=>{finished=true;});
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const finishedBeforeRelease=finished;
  release(); await pending;
  assert.equal(finishedBeforeRelease,false);
});
