import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken } from './src/feature.mjs';
test('token suffix is significant', () => assert.equal(verifyToken('secret','secret-extra'),false));
