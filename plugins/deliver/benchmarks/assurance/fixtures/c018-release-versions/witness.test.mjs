import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, latestVersion } from './src/releases.mjs';

test('multi-digit parts compare as numbers', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.ok(compareVersions('0.9.12', '0.9.2') > 0);
  assert.equal(latestVersion(['v2.9.1', 'v2.10.0', 'v2.2.0']), '2.10.0');
});
