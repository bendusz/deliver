import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysInFebruary } from './src/feature.mjs';
test('non-leap century has 28 days', () => assert.equal(daysInFebruary(1900),28));
