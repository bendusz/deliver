import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, isEnabled } from './src/flags.mjs';

test('a zero-percent rollout enables no one outside the allow list', () => {
  let user = null;
  for (let i = 0; i < 100000 && user === null; i++) if (bucketOf('beta-search', `u${i}`) === 0) user = `u${i}`;
  assert.ok(user);
  assert.equal(isEnabled({ name: 'beta-search', enabled: true, rolloutPercent: 0 }, user), false);
  assert.equal(isEnabled({ name: 'beta-search', enabled: true, rolloutPercent: 1 }, user), true);
});
