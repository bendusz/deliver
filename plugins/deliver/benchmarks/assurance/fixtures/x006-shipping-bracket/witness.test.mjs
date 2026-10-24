import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBracket } from './src/feature.mjs';
test('boundary belongs to next bracket', () => assert.equal(findBracket([{min:0,max:10,rate:4},{min:10,max:20,rate:7}],10),7));
