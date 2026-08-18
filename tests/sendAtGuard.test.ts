import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lastInboundMessageAt, rollBlockedSendAt } from '../src/agents/shared/sendAtGuard.js';

// 2026-07-31 is a Friday, 2026-08-01 a Saturday, 2026-08-02 a Sunday.
const now = new Date('2026-07-31T08:00:00Z');

describe('rollBlockedSendAt', () => {
  it('rolls a Friday send to Sunday at the same wall-clock time', () => {
    assert.deepEqual(rollBlockedSendAt('2026-07-31 14:25', null, now), {
      sendAt: '2026-08-02 14:25',
      rolled: true,
    });
  });

  it('rolls a Saturday send to Sunday', () => {
    assert.deepEqual(rollBlockedSendAt('2026-08-01 10:00', null, now), {
      sendAt: '2026-08-02 10:00',
      rolled: true,
    });
  });

  it('rolls across a month boundary', () => {
    // 2026-10-31 is a Saturday; Sunday is 2026-11-01.
    assert.deepEqual(rollBlockedSendAt('2026-10-31 09:30', null, now), {
      sendAt: '2026-11-01 09:30',
      rolled: true,
    });
  });

  it('leaves weekday sends untouched', () => {
    assert.deepEqual(rollBlockedSendAt('2026-08-03 09:30', null, now), {
      sendAt: '2026-08-03 09:30',
      rolled: false,
    });
  });

  it('leaves weekend replies untouched when the client wrote within 24h', () => {
    const lastInbound = new Date(now.getTime() - 60 * 60 * 1000);
    assert.deepEqual(rollBlockedSendAt('2026-07-31 14:25', lastInbound, now), {
      sendAt: '2026-07-31 14:25',
      rolled: false,
    });
  });

  it('rolls when the client has been silent for more than 24h', () => {
    const lastInbound = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    assert.equal(rollBlockedSendAt('2026-07-31 14:25', lastInbound, now).rolled, true);
  });

  it('preserves seconds and the T separator', () => {
    assert.deepEqual(rollBlockedSendAt('2026-07-31T10:00:30', null, now), {
      sendAt: '2026-08-02T10:00:30',
      rolled: true,
    });
  });

  it('passes unparseable values through for zonedTimeToUtc to reject', () => {
    assert.deepEqual(rollBlockedSendAt('soon', null, now), { sendAt: 'soon', rolled: false });
  });

  // 2026 Israel calendar: Yom Kippur is Monday 2026-09-21 (erev on Sunday
  // 2026-09-20); Rosh Hashana is Sat 2026-09-12 + Sun 2026-09-13 (erev Friday
  // 2026-09-11).
  it('rolls a chag send to the next allowed day', () => {
    assert.deepEqual(rollBlockedSendAt('2026-09-21 10:00', null, now), {
      sendAt: '2026-09-22 10:00',
      rolled: true,
    });
  });

  it('rolls an erev-chag send past the chag itself', () => {
    assert.deepEqual(rollBlockedSendAt('2026-09-20 10:00', null, now), {
      sendAt: '2026-09-22 10:00',
      rolled: true,
    });
  });

  it('rolls past a weekend-adjacent chag stretch in one go', () => {
    // Friday (also erev Rosh Hashana) → Sat/Sun are chag → Monday.
    assert.deepEqual(rollBlockedSendAt('2026-09-11 09:30', null, now), {
      sendAt: '2026-09-14 09:30',
      rolled: true,
    });
  });

  it('leaves chag replies untouched when the client wrote within 24h', () => {
    const nowOnChag = new Date('2026-09-21T08:00:00Z');
    const lastInbound = new Date(nowOnChag.getTime() - 60 * 60 * 1000);
    assert.deepEqual(rollBlockedSendAt('2026-09-21 10:00', lastInbound, nowOnChag), {
      sendAt: '2026-09-21 10:00',
      rolled: false,
    });
  });

  it('leaves chol hamoed and minor holidays open', () => {
    // 2026-09-28 is Monday, chol hamoed Sukkot; 2026-12-07 is Monday, Chanukah.
    assert.deepEqual(rollBlockedSendAt('2026-09-28 10:00', null, now).rolled, false);
    assert.deepEqual(rollBlockedSendAt('2026-12-07 10:00', null, now).rolled, false);
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
