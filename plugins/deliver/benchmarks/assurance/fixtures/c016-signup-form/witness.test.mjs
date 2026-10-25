import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSignup } from './src/validation.mjs';

test('a password containing the email name is refused', () => {
  const errors = validateSignup({ email: 'Jsmith@example.com', password: 'jsmith-2024-secure', displayName: 'J' });
  assert.deepEqual(errors.map((e) => e.field), ['password']);
  assert.deepEqual(validateSignup({ email: 'jo@example.com', password: 'jo-is-twelve-chars', displayName: 'J' }), []);
});
