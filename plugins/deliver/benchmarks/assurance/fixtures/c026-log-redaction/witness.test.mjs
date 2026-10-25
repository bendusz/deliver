import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from './src/logger.mjs';

test('secrets inside arrays are redacted', () => {
  const out = redact({ invites: [{ email: 'a@x.test', password: 'hunter2' }] });
  assert.deepEqual(out, { invites: [{ email: 'a@x.test', password: '[REDACTED]' }] });
});
