import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBadge } from './src/feature.mjs';
test('compact badge escapes attribute content', () => assert.equal(renderBadge('" onmouseover="run()',true),'<span title="&quot; onmouseover=&quot;run()">*</span>'));
