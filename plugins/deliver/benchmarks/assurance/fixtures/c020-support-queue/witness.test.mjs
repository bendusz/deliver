import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueOrder } from './src/tickets.mjs';

test('within a priority the longest-waiting ticket comes first', () => {
  const out = queueOrder([
    { id: 'new', priority: 'high', createdAt: '2024-05-01T10:00:00.000Z' },
    { id: 'old', priority: 'high', createdAt: '2024-05-01T09:00:00.000Z' },
    { id: 'u', priority: 'urgent', createdAt: '2024-05-02T00:00:00.000Z' },
  ]);
  assert.deepEqual(out.map((t) => t.id), ['u', 'old', 'new']);
});
