import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatUpcomingDates } from '../src/agents/shared/upcomingDates.js';

const TZ = 'Asia/Jerusalem';

describe('formatUpcomingDates', () => {
  // 2026-07-31T08:00Z is Friday 11:00 in Israel.
  const now = new Date('2026-07-31T08:00:00Z');

  it('renders one line per day, starting today', () => {
    const lines = formatUpcomingDates(now, TZ).split('\n');
    assert.equal(lines.length, 42);
    assert.equal(lines[0], '2026-07-31 יום שישי — היום, סוף שבוע');
  });

  it('labels weekdays and weekends correctly', () => {
    const lines = formatUpcomingDates(now, TZ).split('\n');
    assert.equal(lines[1], '2026-08-01 יום שבת — סוף שבוע');
    assert.equal(lines[2], '2026-08-02 יום ראשון');
    assert.equal(lines[3], '2026-08-03 יום שני');
    assert.equal(lines[7], '2026-08-07 יום שישי — סוף שבוע');
  });

  it('uses the accountant timezone, not UTC, for "today"', () => {
    // 21:30 UTC is already 00:30 the next day in Israel (UTC+3 in summer).
    const lateEvening = new Date('2026-07-31T21:30:00Z');
    const lines = formatUpcomingDates(lateEvening, TZ).split('\n');
    assert.equal(lines[0], '2026-08-01 יום שבת — היום, סוף שבוע');
  });

  it('crosses month boundaries with correct weekdays', () => {
    const lines = formatUpcomingDates(new Date('2026-08-25T08:00:00Z'), TZ).split('\n');
    assert.ok(lines.includes('2026-09-01 יום שלישי'));
  });

  it('honors a custom horizon', () => {
    assert.equal(formatUpcomingDates(now, TZ, 7).split('\n').length, 7);
  });

  it('marks chag and erev chag days', () => {
    // Window covering Yom Kippur 2026: Monday 2026-09-21, erev on Sunday 2026-09-20.
    const lines = formatUpcomingDates(new Date('2026-09-09T08:00:00Z'), TZ).split('\n');
    const erev = lines.find((l) => l.startsWith('2026-09-20'));
    const chag = lines.find((l) => l.startsWith('2026-09-21'));
    assert.match(erev!, /ערב חג — /);
    assert.match(chag!, /— חג — /);
  });

  it('does not mark chol hamoed or minor holidays', () => {
    const lines = formatUpcomingDates(new Date('2026-09-09T08:00:00Z'), TZ).split('\n');
    const cholHamoed = lines.find((l) => l.startsWith('2026-09-28'));
    assert.doesNotMatch(cholHamoed!, /חג/);
  });
});
