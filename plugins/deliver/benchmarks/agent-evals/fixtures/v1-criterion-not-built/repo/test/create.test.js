import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask } from '../src/create.js';

test('createTask returns 201 with the title', () => {
  assert.deepEqual(createTask('a'), { status: 201, body: { title: 'a' } });
});
