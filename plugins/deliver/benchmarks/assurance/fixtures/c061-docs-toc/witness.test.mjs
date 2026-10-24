import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableOfContents } from './src/markdown.mjs';

test('comments in code blocks are not headings', () => {
  const md = ['# Setup', '```sh', '# install deps', 'npm ci', '```', '~~~python', '## not this', '~~~', '## Run'].join('\n');
  assert.deepEqual(tableOfContents(md).map((e) => e.text), ['Setup', 'Run']);
});
