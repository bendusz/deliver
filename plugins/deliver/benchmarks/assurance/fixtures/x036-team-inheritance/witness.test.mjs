import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inheritedTeams } from './src/feature.mjs';
test('deep organizations avoid repeated ancestor walks', () => {
  let reads=0; const n=600;
  const nodes=Array.from({length:n},(_,i)=>({id:String(i),parentId:i===0?null:String(i-1),get team(){reads++; return i===0?'ops':null;}}));
  assert.equal(inheritedTeams(nodes).at(-1),'ops');
  assert.ok(reads <= n*10, `team reads: ${reads}`);
});
