import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin } from './src/http.mjs';

test('a look-alike domain is not a subdomain', () => {
  assert.equal(isAllowedOrigin('https://evilexample.com', ['https://*.example.com']), false);
  assert.equal(isAllowedOrigin('https://a.example.com', ['https://*.example.com']), true);
});
