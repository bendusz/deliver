import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug } from '../src/slug.js';

test('slug lowercases and joins with dashes', () => {
  assert.equal(slug('Buy Milk!'), 'buy-milk');
});

test('slug of blank text is empty', () => {
  assert.equal(slug('  '), '');
});
