import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveUpload } from './src/uploads.mjs';

test('a sibling directory sharing the root as a prefix is outside', () => {
  const root = path.resolve('data', 'uploads');
  assert.throws(() => resolveUpload(root, '../uploads-other/x.txt'), { code: 'EOUTSIDE' });
  assert.throws(() => resolveUpload(root, '.'), { code: 'EOUTSIDE' });
  assert.equal(resolveUpload(root, 'x.txt'), path.join(root, 'x.txt'));
});
