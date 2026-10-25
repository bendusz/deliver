import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capturePayment } from './src/capture.mjs';

test('an unlisted gateway error is not a decline', async () => {
  const order = { id: 'o2', totalCents: 990, status: 'pending' };
  const gateway = { charge: async () => { throw Object.assign(new Error('idempotency key reused'), { code: 'idempotency_error' }); } };
  await assert.rejects(capturePayment(gateway, order), { code: 'idempotency_error' });
  assert.equal(order.status, 'pending');
});
