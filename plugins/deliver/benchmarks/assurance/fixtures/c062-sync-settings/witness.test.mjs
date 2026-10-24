import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSettings } from './src/settings.mjs';

test('a damaged settings file is reported, not replaced', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{"paused": tru');
  await assert.rejects(readSettings(file));
  await assert.rejects(readSettings(dir));
});
