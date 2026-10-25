import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchContacts } from './src/feature.mjs';
test('archive search option', () => assert.deepEqual(searchContacts([{name:'Ada',archived:true}],'ada',{includeArchived:true}),[{name:'Ada',archived:true}]));
