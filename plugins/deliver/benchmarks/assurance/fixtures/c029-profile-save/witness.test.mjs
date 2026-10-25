import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocStore } from './src/profile-store.mjs';
import { saveProfile } from './src/profiles.mjs';

test('a new profile is stored by the time saveProfile resolves', async () => {
  const store = new DocStore();
  await saveProfile(store, 'u9', { bio: 'new here' });
  assert.equal(store.docs.has('u9'), true);
  assert.equal(store.docs.get('u9').bio, 'new here');
});
