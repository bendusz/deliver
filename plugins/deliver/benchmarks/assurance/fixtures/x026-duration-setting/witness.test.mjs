import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from './src/feature.mjs';
test('suffix is not a duration', () => assert.throws(() => parseDuration('15ms'),TypeError));
