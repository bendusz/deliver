import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDue } from '../src/due.js';

test('parseDue reads an ISO day', () => {
  assert.equal(parseDue('2026-03-01').toISOString(), '2026-03-01T00:00:00.000Z');
});

test.skip('parseDue throws RangeError on garbage', () => {
  assert.throws(() => parseDue('not a date'), RangeError);
});
