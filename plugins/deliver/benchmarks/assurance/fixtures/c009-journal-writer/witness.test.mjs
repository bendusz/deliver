import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serialize } from './src/serial.mjs';

test('later calls still run after a failure', async () => {
  const written = [];
  const write = serialize(async (line) => {
    if (line === 'bad') throw new Error('disk full');
    written.push(line);
    return line;
  });
  const settle = (p) => p.then((v) => `ok ${v}`, (e) => `failed ${e.message}`);
  const results = await Promise.all([settle(write('a')), settle(write('bad')), settle(write('c'))]);
  assert.deepEqual(results, ['ok a', 'failed disk full', 'ok c']);
  assert.deepEqual(written, ['a', 'c']);
});
