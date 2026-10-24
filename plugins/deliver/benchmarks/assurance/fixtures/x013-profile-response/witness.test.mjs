import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicProfile } from './src/feature.mjs';
test('private metadata is omitted', () => assert.deepEqual(publicProfile({id:'u',displayName:'Sam',passwordHash:'hash',internalTag:'staff'}),{id:'u',displayName:'Sam'}));
