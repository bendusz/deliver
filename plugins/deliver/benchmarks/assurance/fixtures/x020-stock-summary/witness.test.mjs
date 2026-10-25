import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventorySummary } from './src/feature.mjs';
test('report includes empty stock on request', () => assert.deepEqual(inventorySummary([{sku:'b',quantity:0}],{includeEmpty:true}),[{sku:'b',quantity:0}]));
