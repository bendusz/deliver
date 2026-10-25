import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncateUtf8 } from './src/payload.mjs';

test('the byte budget holds for text that is short in characters', () => {
  const text = 'Привет! Как дела? '.repeat(6);
  const out = truncateUtf8(text, 178);
  assert.ok(new TextEncoder().encode(out).length <= 178);
  assert.ok(out.endsWith('…'));
});
