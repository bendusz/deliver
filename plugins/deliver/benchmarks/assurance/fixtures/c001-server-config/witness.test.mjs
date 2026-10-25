import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './src/config.mjs';

test('an unknown key in the settings file fails at startup', () => {
  assert.throws(() => loadConfig({ prot: 9000 }, {}), /prot/);
  assert.equal(loadConfig({ port: 9000 }, {}).port, 9000);
});
