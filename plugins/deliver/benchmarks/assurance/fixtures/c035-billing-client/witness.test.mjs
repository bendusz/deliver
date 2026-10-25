import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getJson } from './src/client.mjs';

test('a gateway error page is still an HttpError', async () => {
  const fetch = async () => ({ ok: false, status: 502, text: async () => '<html><h1>502 Bad Gateway</h1></html>' });
  await assert.rejects(getJson(fetch, '/invoices/1'), { name: 'HttpError', status: 502 });
});
