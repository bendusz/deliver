import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lowestBid } from './src/feature.mjs';
test('empty auction returns null', () => assert.equal(lowestBid([]),null));
