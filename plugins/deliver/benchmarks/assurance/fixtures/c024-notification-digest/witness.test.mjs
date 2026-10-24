import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendDigests } from './src/notify.mjs';

test('sendDigests resolves only after every send has finished', async () => {
  const delivered = [];
  const send = async (to) => {
    await new Promise((resolve) => setImmediate(resolve));
    delivered.push(to);
  };
  const count = await sendDigests([{ email: 'a@x.test', unread: 1 }, { email: 'b@x.test', unread: 4 }], send);
  assert.equal(count, 2);
  assert.deepEqual(delivered.sort(), ['a@x.test', 'b@x.test']);
});
