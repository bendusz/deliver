import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvLine } from './src/statements.mjs';

test('doubled quotes inside a quoted field are one quote', () => {
  assert.deepEqual(parseCsvLine('2024-01-05,"Coffee ""Bean"" Co, Ltd",-4.50'), ['2024-01-05', 'Coffee "Bean" Co, Ltd', '-4.50']);
});
