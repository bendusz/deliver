import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOptions } from './src/feature.mjs';
test('strict mode rejects misspelled options', () => assert.throws(() => loadOptions({porrt:80},{strict:true}),TypeError));
