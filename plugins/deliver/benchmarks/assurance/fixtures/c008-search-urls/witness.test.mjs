import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toQueryString } from './src/urls.mjs';

test('each selected tag is its own parameter', () => {
  assert.equal(toQueryString({ tag: ['sale', 'new'] }), '?tag=sale&tag=new');
});
