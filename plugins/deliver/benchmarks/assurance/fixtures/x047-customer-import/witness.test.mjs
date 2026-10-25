import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCustomer } from './src/feature.mjs';
test('customer identifiers retain leading zeros', () => assert.deepEqual(parseCustomer('000123\tAda'),{id:'000123',name:'Ada'}));
