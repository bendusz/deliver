import { test } from 'node:test';
import assert from 'node:assert/strict';
import { health } from '../src/health.js';

test('health returns ok', () => {
  assert.deepEqual(health(), { status: 200, body: { ok: true } });
});
