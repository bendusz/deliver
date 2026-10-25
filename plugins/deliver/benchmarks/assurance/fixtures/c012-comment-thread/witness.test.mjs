import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderComment } from './src/comments.mjs';

test('the author is escaped when it is a link too', () => {
  const html = renderComment({ author: '<img src=x onerror=alert(1)>', website: 'https://a.example', body: 'hi', createdAt: '2024-05-01T10:00:00Z' });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;</a>'));
});
