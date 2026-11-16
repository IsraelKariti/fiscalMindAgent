import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyticsPresetRange, barShares, durationParts, formatPercent } from '../web/src/components/messageAnalytics.js';

// The admin analytics tab's rendering helpers (openspec `discarded-message-analytics`).

const s = 1000;
const min = 60 * s;
const h = 60 * min;
const d = 24 * h;

test('durationParts: largest fitting unit plus one smaller', () => {
  assert.deepEqual(durationParts(35 * s), [{ value: 35, unit: 's' }]);
  assert.deepEqual(durationParts(12 * min + 20 * s), [{ value: 12, unit: 'min' }]);
  assert.deepEqual(durationParts(4 * h + 20 * min), [
    { value: 4, unit: 'h' },
    { value: 20, unit: 'min' },
  ]);
  assert.deepEqual(durationParts(2 * h), [{ value: 2, unit: 'h' }]);
  assert.deepEqual(durationParts(2 * d + 3 * h + 10 * min), [
    { value: 2, unit: 'd' },
    { value: 3, unit: 'h' },
  ]);
  assert.deepEqual(durationParts(0), [{ value: 0, unit: 's' }]);
  assert.deepEqual(durationParts(-5), [{ value: 0, unit: 's' }]);
});

test('formatPercent', () => {
  assert.equal(formatPercent(0.666), '67%');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(1), '100%');
  assert.equal(formatPercent(null), '—');
});

test('analyticsPresetRange: last N local days ending today, or the whole life', () => {
  assert.deepEqual(analyticsPresetRange(30, '2026-11-15', '2026-03-01'), { from: '2026-10-17', to: '2026-11-15' });
  assert.deepEqual(analyticsPresetRange(90, '2026-11-15', null), { from: '2026-08-18', to: '2026-11-15' });
  assert.deepEqual(analyticsPresetRange('all', '2026-11-15', '2026-03-01'), { from: '2026-03-01', to: '2026-11-15' });
  assert.deepEqual(analyticsPresetRange('all', '2026-11-15', null), { from: '2026-11-15', to: '2026-11-15' });
});

test('barShares: relative to the tallest bar', () => {
  assert.deepEqual(barShares([1, 4, 2]), [0.25, 1, 0.5]);
  assert.deepEqual(barShares([0, 0]), [0, 0]);
});
