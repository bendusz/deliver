import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from './src/feature.mjs';
test('quotes alone require CSV escaping', () => assert.equal(csvCell('a"b'),'"a""b"'));
