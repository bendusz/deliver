import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportRows } from './src/feature.mjs';
test('header option is honored', () => assert.equal(exportRows([{name:'Ada'}],['name'],{header:false}),'Ada'));
