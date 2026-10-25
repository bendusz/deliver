import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule } from './src/push.mjs';

test('urgent notifications ignore quiet hours', () => {
  const now = Date.parse('2024-05-01T23:30:00Z');
  const out = schedule([{ id: 'n', priority: 'normal' }, { id: 'u', priority: 'urgent' }], { quietStart: '23:00', quietEnd: '06:30', utcOffsetMinutes: 0 }, now);
  assert.deepEqual(out.map((n) => [n.id, n.deliverAt]), [['u', now], ['n', Date.parse('2024-05-02T06:30:00Z')]]);
});
