import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue } from './src/queue.mjs';
import { runOnce } from './src/worker.mjs';

test('an exhausted job lands in the dead-letter list with its error', async () => {
  const q = new JobQueue();
  q.push({ id: 'j1', type: 'resize', payload: { w: 10 } });
  const handlers = { resize: async () => { throw new Error('corrupt image'); } };
  for (let i = 0; i < 2; i++) await runOnce(q, handlers, { maxAttempts: 2 });
  assert.equal(q.dead.length, 1);
  assert.equal(q.dead[0].id, 'j1');
  assert.equal(q.dead[0].attempts, 2);
  assert.equal(q.dead[0].error, 'corrupt image');
});
