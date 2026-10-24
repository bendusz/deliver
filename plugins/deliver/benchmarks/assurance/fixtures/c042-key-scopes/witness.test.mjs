import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasScope } from './src/keys.mjs';

test('a resource wildcard does not cover a resource sharing its prefix', () => {
  assert.equal(hasScope(['users:*'], 'users-admin:write'), false);
  assert.equal(hasScope(['invoices:*'], 'invoices-archive:delete'), false);
  assert.equal(hasScope(['users:*'], 'users:write'), true);
});
