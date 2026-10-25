import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEnvelope } from './src/feature.mjs';
test('wrapped error retains structured cause', () => {
  const original=Object.assign(new SyntaxError('bad token'),{offset:7});
  assert.throws(()=>decodeEnvelope('bad',()=>{throw original;}),e=>e.message==='Cannot decode message envelope' && e.cause===original);
});
