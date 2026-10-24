import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeField } from './src/feature.mjs';
test('every form separator becomes space', () => assert.equal(decodeField('a+b+c'),'a b c'));
