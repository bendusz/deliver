import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeContacts } from './src/contacts.mjs';

test('each email is read a constant number of times', () => {
  let reads = 0;
  const n = 3000;
  const contacts = Array.from({ length: n }, (_, i) => ({
    name: `c${i}`,
    get email() { reads++; return `user${i}@example.com`; },
  }));
  const out = dedupeContacts(contacts);
  assert.equal(out.length, n);
  assert.ok(reads <= 5 * n, `email read ${reads} times for ${n} contacts`);
});
