import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrollments } from './src/feature.mjs';
test('large joins read student identifiers a bounded number of times', () => {
  let reads=0; const n=600;
  const students=Array.from({length:n},(_,i)=>({get id(){reads++; return String(i);}}));
  const rows=Array.from({length:n},(_,i)=>({course:'c',studentId:String(n-1-i)}));
  const result=enrollments(students,rows);
  assert.equal(result.length,n); assert.equal(result[0].student,students[n-1]);
  assert.ok(reads <= n*10, `identifier reads: ${reads}`);
});
