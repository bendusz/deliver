import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archive } from './src/feature.mjs';
test('preview leaves records unchanged', () => { const rows=[{id:'a',archived:false}]; assert.deepEqual(archive(rows,['a'],{dryRun:true}),['a']); assert.equal(rows[0].archived,false); });
