import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetric } from './src/feature.mjs';
test('zero is an observed reading', () => assert.equal(parseMetric('0'),0));
