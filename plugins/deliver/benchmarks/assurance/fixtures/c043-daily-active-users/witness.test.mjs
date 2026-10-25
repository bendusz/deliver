import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay, dailyActiveCounts } from './src/activity.mjs';

test('offsets east and west of UTC move the day the right way', () => {
  assert.equal(localDay(Date.parse('2024-03-10T23:30:00Z'), 60), '2024-03-11');
  assert.equal(localDay(Date.parse('2024-03-10T03:00:00Z'), -300), '2024-03-09');
  assert.deepEqual(dailyActiveCounts([{ userId: 'a', at: Date.parse('2024-03-10T23:30:00Z') }], 60), { '2024-03-11': 1 });
});
