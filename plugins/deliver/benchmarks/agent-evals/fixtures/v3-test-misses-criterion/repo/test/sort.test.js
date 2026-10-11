import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byDue } from '../src/sort.js';

test('byDue returns every task', () => {
  const tasks = [{ due: '2026-01-01' }, { due: '2026-02-01' }];
  assert.equal(byDue(tasks).length, 2);
});

test('byDue does not modify its input', () => {
  const tasks = [{ due: '2026-02-01' }, { due: '2026-01-01' }];
  byDue(tasks);
  assert.equal(tasks[0].due, '2026-02-01');
});
