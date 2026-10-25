import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserRepo } from './src/repo.mjs';
import { withAuthors } from './src/feed.mjs';

test('a full page costs one user query', async () => {
  const repo = new UserRepo(Array.from({ length: 10 }, (_, i) => ({ id: i, name: `u${i}` })));
  const posts = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, authorId: i % 10, text: '' }));
  const out = await withAuthors(posts, repo);
  assert.equal(out[13].author.name, 'u3');
  assert.ok(repo.queries <= 1, `${repo.queries} queries for one page`);
});
