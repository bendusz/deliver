import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings } from './src/feature.mjs';
test('explicit disabled setting wins', () => {
  assert.deepEqual(mergeSettings({enabled: true, retries: 3}, {enabled: false, retries: 0}), {enabled: false, retries: 0});
});
