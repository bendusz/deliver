import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeBlocks } from './src/calendar.mjs';

test('back-to-back meetings become one block', () => {
  assert.deepEqual(mergeBlocks([[600, 660], [540, 600]]), [[540, 660]]);
  assert.deepEqual(mergeBlocks([[540, 600], [601, 660]]), [[540, 600], [601, 660]]);
});
