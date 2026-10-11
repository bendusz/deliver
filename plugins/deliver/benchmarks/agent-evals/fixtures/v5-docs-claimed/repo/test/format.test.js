import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format } from '../src/format.js';

test('format prints JSON when asked', () => {
  assert.equal(format([{ title: 'a' }], { json: true }), '[{"title":"a"}]');
});
