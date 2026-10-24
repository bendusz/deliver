import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions } from './src/feature.mjs';
test('multi-digit minor releases', () => assert.equal(compareVersions('1.10.0','1.9.0'),1));
