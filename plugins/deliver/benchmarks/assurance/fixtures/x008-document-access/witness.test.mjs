import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRead } from './src/feature.mjs';
test('admin stays within tenant', () => assert.equal(canRead({id:'u',tenantId:'a',role:'admin'}, {ownerId:'v',tenantId:'b'}),false));
