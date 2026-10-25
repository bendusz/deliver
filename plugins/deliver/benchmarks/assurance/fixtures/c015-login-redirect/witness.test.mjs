import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirect, DEFAULT_LANDING } from './src/session.mjs';

test('a protocol-relative target is another host', () => {
  assert.equal(safeRedirect('//evil.example/login'), DEFAULT_LANDING);
  assert.equal(safeRedirect('/account'), '/account');
});
