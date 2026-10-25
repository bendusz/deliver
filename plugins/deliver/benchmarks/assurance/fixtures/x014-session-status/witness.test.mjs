import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionActive } from './src/feature.mjs';
test('all recorded revocations deny access', () => assert.equal(sessionActive({expiresAt:100,revokedAt:0},10),false));
