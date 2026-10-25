import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewText } from './src/feature.mjs';
test('emoji code point remains whole', () => assert.equal(previewText('A😀B',2),'A😀'));
