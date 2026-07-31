import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lastInboundMessageAt, rollWeekendSendAt } from '../src/agents/shared/sendAtGuard.js';

// 2026-07-31 is a Friday, 2026-08-01 a Saturday, 2026-08-02 a Sunday.
const now = new Date('2026-07-31T08:00:00Z');

describe('rollWeekendSendAt', () => {
  it('rolls a Friday send to Sunday at the same wall-clock time', () => {
    assert.deepEqual(rollWeekendSendAt('2026-07-31 14:25', null, now), {
      sendAt: '2026-08-02 14:25',
      rolled: true,
    });
  });

  it('rolls a Saturday send to Sunday', () => {
    assert.deepEqual(rollWeekendSendAt('2026-08-01 10:00', null, now), {
      sendAt: '2026-08-02 10:00',
      rolled: true,
    });
  });

  it('rolls across a month boundary', () => {
    // 2026-10-31 is a Saturday; Sunday is 2026-11-01.
    assert.deepEqual(rollWeekendSendAt('2026-10-31 09:30', null, now), {
      sendAt: '2026-11-01 09:30',
      rolled: true,
    });
  });

  it('leaves weekday sends untouched', () => {
    assert.deepEqual(rollWeekendSendAt('2026-08-03 09:30', null, now), {
      sendAt: '2026-08-03 09:30',
      rolled: false,
    });
  });

  it('leaves weekend replies untouched when the client wrote within 24h', () => {
    const lastInbound = new Date(now.getTime() - 60 * 60 * 1000);
    assert.deepEqual(rollWeekendSendAt('2026-07-31 14:25', lastInbound, now), {
      sendAt: '2026-07-31 14:25',
      rolled: false,
    });
  });

  it('rolls when the client has been silent for more than 24h', () => {
    const lastInbound = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    assert.equal(rollWeekendSendAt('2026-07-31 14:25', lastInbound, now).rolled, true);
  });

  it('preserves seconds and the T separator', () => {
    assert.deepEqual(rollWeekendSendAt('2026-07-31T10:00:30', null, now), {
      sendAt: '2026-08-02T10:00:30',
      rolled: true,
    });
  });

  it('passes unparseable values through for zonedTimeToUtc to reject', () => {
    assert.deepEqual(rollWeekendSendAt('soon', null, now), { sendAt: 'soon', rolled: false });
  });
});

describe('lastInboundMessageAt', () => {
  const at = (iso: string) => new Date(iso);

  it('returns the most recent inbound message time, preferring sent_at', () => {
    const history = [
      { direction: 'inbound', sent_at: at('2026-07-28T10:00:00Z'), created_at: at('2026-07-28T09:59:00Z') },
      { direction: 'outbound', sent_at: at('2026-07-29T10:00:00Z'), created_at: at('2026-07-29T10:00:00Z') },
      { direction: 'inbound', sent_at: null, created_at: at('2026-07-30T12:00:00Z') },
      { direction: 'outbound', sent_at: null, created_at: at('2026-07-31T07:00:00Z') },
    ];
    assert.deepEqual(lastInboundMessageAt(history), at('2026-07-30T12:00:00Z'));
  });

  it('returns null when the client never wrote', () => {
    assert.equal(
      lastInboundMessageAt([{ direction: 'outbound', sent_at: null, created_at: at('2026-07-30T12:00:00Z') }]),
      null,
    );
  });
});
