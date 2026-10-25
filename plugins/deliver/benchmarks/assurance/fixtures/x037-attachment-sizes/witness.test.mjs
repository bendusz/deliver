import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileSizes } from './src/feature.mjs';
test('repeated attachments share metadata reads', () => {
  let calls=0; const paths=Array(1000).fill('report.pdf');
  const result=fileSizes(paths,()=>{calls++; return {size:10};});
  assert.equal(result.length,1000); assert.ok(result.every(size=>size===10));
  assert.equal(calls,1);
});
