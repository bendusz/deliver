import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountingDay } from './src/feature.mjs';
test('receipt date survives offset conversion boundary', () => assert.equal(accountingDay('2026-04-02T00:30:00+02:00'),'2026-04-02'));
