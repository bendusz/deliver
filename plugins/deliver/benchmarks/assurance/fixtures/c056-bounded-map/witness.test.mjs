import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLimit } from './src/tasks.mjs';

test('results keep input order when calls finish out of order', async () => {
  const resolvers = [];
  const run = mapLimit([1, 2, 3], 3, (x) => new Promise((resolve) => { resolvers[x - 1] = () => resolve(x * 10); }));
  assert.equal(resolvers.length, 3);
  resolvers[2]();
  resolvers[1]();
  resolvers[0]();
  assert.deepEqual(await run, [10, 20, 30]);
});
