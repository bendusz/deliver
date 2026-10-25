import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirectTarget } from './src/feature.mjs';
test('network path is not a local return target', () => assert.equal(redirectTarget('//other.test/account'),'/home'));
