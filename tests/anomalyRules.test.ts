import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  evaluateOffHours,
  evaluateTokenSpikes,
  evaluateVolumeSpikes,
  hourInTimeZone,
} from '../src/alerts/anomalyRules.js';

const OPTS = { minThreshold: 20, multiplier: 4 };

test('volume spike: quiet instance below the floor does not alert', () => {
  const spikes = evaluateVolumeSpikes([{ key: 'a', count: 15 }], [], 168, OPTS);
  assert.equal(spikes.length, 0);
});

test('volume spike: quiet instance above the floor alerts', () => {
  const spikes = evaluateVolumeSpikes([{ key: 'a', count: 21 }], [], 168, OPTS);
  assert.equal(spikes.length, 1);
  assert.equal(spikes[0]?.threshold, 20);
});

test('volume spike: busy instance is judged against its own baseline', () => {
  // 1680 sends over 168h → 10/h baseline → threshold max(20, 40) = 40.
  const baseline = [{ key: 'a', count: 1680 }];
  assert.equal(evaluateVolumeSpikes([{ key: 'a', count: 39 }], baseline, 168, OPTS).length, 0);
  const spikes = evaluateVolumeSpikes([{ key: 'a', count: 41 }], baseline, 168, OPTS);
  assert.equal(spikes.length, 1);
  assert.equal(spikes[0]?.threshold, 40);
  assert.equal(spikes[0]?.baselineHourlyAvg, 10);
});

test('volume spike: keys are independent', () => {
  const spikes = evaluateVolumeSpikes(
    [
      { key: 'a', count: 100 },
      { key: 'b', count: 5 },
    ],
    [{ key: 'a', count: 168 }],
    168,
    OPTS,
  );
  assert.deepEqual(spikes.map((s) => s.key), ['a']);
});

test('hourInTimeZone converts UTC instants to the local wall clock', () => {
  // 2026-07-24T00:30Z = 03:30 in Jerusalem (UTC+3 in July).
  assert.equal(hourInTimeZone(new Date('2026-07-24T00:30:00Z'), 'Asia/Jerusalem'), 3);
  assert.equal(hourInTimeZone(new Date('2026-07-24T12:00:00Z'), 'Asia/Jerusalem'), 15);
});

test('off-hours: flags only occurrences outside [7, 22) local time', () => {
  const night = { occurredAt: new Date('2026-07-24T00:30:00Z'), key: 'a' }; // 03:30 local
  const day = { occurredAt: new Date('2026-07-24T09:00:00Z'), key: 'b' }; // 12:00 local
  const late = { occurredAt: new Date('2026-07-24T19:30:00Z'), key: 'c' }; // 22:30 local
  const hits = evaluateOffHours([night, day, late], 'Asia/Jerusalem');
  assert.deepEqual(hits.map((h) => h.key), ['a', 'c']);
  assert.equal(hits[0]?.localHour, 3);
});

test('token spike: floor keeps new/light users from alerting', () => {
  const spikes = evaluateTokenSpikes([{ key: 'u', today: 1_500_000, priorTotal: 0, priorDays: 0 }], {
    minTokens: 2_000_000,
    multiplier: 4,
  });
  assert.equal(spikes.length, 0);
});

test('token spike: heavy day vs prior week average alerts', () => {
  // Prior avg 1M/day → threshold max(2M, 4M) = 4M.
  const usage = [{ key: 'u', today: 4_100_000, priorTotal: 7_000_000, priorDays: 7 }];
  const spikes = evaluateTokenSpikes(usage, { minTokens: 2_000_000, multiplier: 4 });
  assert.equal(spikes.length, 1);
  assert.equal(spikes[0]?.threshold, 4_000_000);
});
