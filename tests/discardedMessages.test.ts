import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LIFETIME_BUCKETS, lifetimeBucket, mondayOf, summarize, type DraftOutcome } from '../src/analytics/discardedMessages.js';

// The admin analytics tab's figures (openspec `discarded-message-analytics`).
// Times are UTC noon-ish so the Israel calendar day never straddles a boundary.

const TZ = 'Asia/Jerusalem';
let seq = 0;

function draft(over: Partial<DraftOutcome> & { at: string }): DraftOutcome {
  seq += 1;
  const createdAt = new Date(over.at);
  return {
    id: `d${seq}`,
    clientId: 'c1',
    clientName: 'דנה',
    clientDeleted: false,
    sent: false,
    planTrigger: 'client_message',
    scheduledFor: null,
    discardedAt: null,
    discardReason: null,
    cost: null,
    ...over,
    createdAt,
  };
}

const h = (n: number) => n * 3_600_000;
const plus = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms);

test('tiles: written, sent, discarded, pending, discard rate', () => {
  const rows: DraftOutcome[] = [];
  for (let i = 0; i < 25; i++) rows.push(draft({ at: '2026-11-02T10:00:00Z', sent: true, cost: 0.001 }));
  for (let i = 0; i < 12; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', discardReason: 'client_message', discardedAt: plus('2026-11-03T10:00:00Z', h(2)), cost: 0.002 }));
  for (let i = 0; i < 3; i++) rows.push(draft({ at: '2026-11-04T10:00:00Z' }));
  const s = summarize(rows, TZ);
  assert.equal(s.tiles.written, 40);
  assert.equal(s.tiles.sent, 25);
  assert.equal(s.tiles.discarded, 12);
  assert.equal(s.tiles.pending, 3);
  assert.equal(s.tiles.discardRate, 0.3);
  assert.ok(Math.abs(s.tiles.discardedCost.known - 0.024) < 1e-9);
  assert.equal(s.tiles.discardedCost.unknown, 0);
  // The 3 pending drafts have no cost yet: unknown, counted in "all".
  assert.equal(s.tiles.allCost.unknown, 3);
  assert.ok(Math.abs(s.tiles.allCost.known - 0.049) < 1e-9);
  assert.ok(Math.abs(s.tiles.wasteShare! - 0.024 / 0.049) < 1e-9);
});

test('unknown cost: pre-076 discards count but their cost is unknown, never zero', () => {
  const rows: DraftOutcome[] = [];
  for (let i = 0; i < 10; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', discardReason: 'client_message', cost: 0.005 }));
  for (let i = 0; i < 2; i++) rows.push(draft({ at: '2026-11-03T11:00:00Z', discardReason: 'unknown', cost: null }));
  const s = summarize(rows, TZ);
  assert.equal(s.tiles.discarded, 12);
  assert.ok(Math.abs(s.tiles.discardedCost.known - 0.05) < 1e-9);
  assert.equal(s.tiles.discardedCost.unknown, 2);
});

test('empty input', () => {
  const s = summarize([], TZ);
  assert.equal(s.tiles.written, 0);
  assert.equal(s.tiles.discardRate, null);
  assert.equal(s.tiles.wasteShare, null);
  assert.deepEqual(s.reasons, []);
  assert.deepEqual(s.weeks, []);
  assert.deepEqual(s.topClients, []);
  assert.equal(s.lifetime.medianMs, null);
});

test('reasons sorted by count with their share', () => {
  const rows: DraftOutcome[] = [];
  for (let i = 0; i < 8; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', discardReason: 'client_message' }));
  for (let i = 0; i < 3; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', discardReason: 'file_verification' }));
  rows.push(draft({ at: '2026-11-03T10:00:00Z', discardReason: 'unknown' }));
  const s = summarize(rows, TZ);
  assert.deepEqual(
    s.reasons.map((r) => [r.reason, r.count, Math.round(r.share * 100)]),
    [
      ['client_message', 8, 67],
      ['file_verification', 3, 25],
      ['unknown', 1, 8],
    ],
  );
});

test('triggers: sorted by discarded cost, with the most common discard reason', () => {
  const rows: DraftOutcome[] = [];
  // 20 after a client message: 4 discarded (0.01 total), 16 sent.
  for (let i = 0; i < 16; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', planTrigger: 'client_message', sent: true, cost: 0.001 }));
  for (let i = 0; i < 4; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', planTrigger: 'client_message', discardReason: 'file_verification', cost: 0.0025 }));
  // 15 after the agent's own send: 10 discarded (0.03 total), 9 of them by a client reply.
  for (let i = 0; i < 5; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', planTrigger: 'agent_message_sent', sent: true, cost: 0.001 }));
  for (let i = 0; i < 9; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', planTrigger: 'agent_message_sent', discardReason: 'client_message', cost: 0.003 }));
  rows.push(draft({ at: '2026-11-03T10:00:00Z', planTrigger: 'agent_message_sent', discardReason: 'tax_fetch', cost: 0.003 }));
  const s = summarize(rows, TZ);
  assert.equal(s.triggers.length, 2);
  const [first, second] = s.triggers;
  assert.equal(first!.trigger, 'agent_message_sent');
  assert.equal(first!.written, 15);
  assert.equal(first!.sent, 5);
  assert.equal(first!.discarded, 10);
  assert.equal(Math.round(first!.discardRate! * 100), 67);
  assert.ok(Math.abs(first!.discardedCost.known - 0.03) < 1e-9);
  assert.equal(first!.topReason, 'client_message');
  assert.equal(second!.trigger, 'client_message');
  assert.equal(second!.written, 20);
  assert.equal(second!.discarded, 4);
  assert.equal(second!.discardRate, 0.2);
  assert.ok(Math.abs(second!.discardedCost.known - 0.01) < 1e-9);
  assert.equal(second!.topReason, 'file_verification');
});

test('lifetime: median, average, histogram, share of the planned wait', () => {
  const at = '2026-11-03T07:00:00Z'; // 09:00 Israel
  const rows: DraftOutcome[] = [
    draft({ at, discardReason: 'client_message', discardedAt: plus(at, 30_000) }),
    // written 09:00 for 21:00, discarded 12:00 → 25% of the wait
    draft({ at, discardReason: 'client_message', discardedAt: plus(at, h(3)), scheduledFor: plus(at, h(12)) }),
    draft({ at, discardReason: 'client_message', discardedAt: plus(at, h(26)) }),
    // backfilled: reason known, time unknown → in the counts, not in the lifetimes
    draft({ at, discardReason: 'unknown' }),
    // discarded after its planned time: share capped at 100%
    draft({ at, discardReason: 'client_message', discardedAt: plus(at, h(5)), scheduledFor: plus(at, h(4)) }),
  ];
  const s = summarize(rows, TZ);
  assert.equal(s.tiles.discarded, 5);
  assert.equal(s.lifetime.known, 4);
  assert.equal(s.lifetime.medianMs, (h(3) + h(5)) / 2);
  assert.equal(s.lifetime.averageMs, (30_000 + h(3) + h(26) + h(5)) / 4);
  assert.equal(s.lifetime.waitShareKnown, 2);
  assert.equal(s.lifetime.medianWaitShare, (0.25 + 1) / 2);
  assert.deepEqual(
    s.lifetime.histogram.filter((b) => b.count > 0).map((b) => [b.bucket, b.count]),
    [
      ['30s_40s', 1],
      ['1h_6h', 2],
      ['1d_3d', 1],
    ],
  );
});

test('lifetime buckets: 10 s steps to 3 min, 1 min steps to 10 min, then coarse', () => {
  assert.equal(LIFETIME_BUCKETS.length, 30);
  assert.equal(LIFETIME_BUCKETS[0], '0s_10s');
  assert.equal(LIFETIME_BUCKETS[17], '170s_180s');
  assert.equal(LIFETIME_BUCKETS[18], '3m_4m');
  assert.equal(LIFETIME_BUCKETS[24], '9m_10m');
  assert.equal(LIFETIME_BUCKETS[25], '10m_1h');
  assert.equal(lifetimeBucket(-5), '0s_10s');
  assert.equal(lifetimeBucket(0), '0s_10s');
  assert.equal(lifetimeBucket(9_999), '0s_10s');
  assert.equal(lifetimeBucket(10_000), '10s_20s');
  assert.equal(lifetimeBucket(59_999), '50s_60s');
  assert.equal(lifetimeBucket(60_000), '60s_70s');
  assert.equal(lifetimeBucket(179_999), '170s_180s');
  assert.equal(lifetimeBucket(180_000), '3m_4m');
  assert.equal(lifetimeBucket(9 * 60_000 + 59_999), '9m_10m');
  assert.equal(lifetimeBucket(10 * 60_000), '10m_1h');
  assert.equal(lifetimeBucket(h(1)), '1h_6h');
  assert.equal(lifetimeBucket(h(6)), '6h_24h');
  assert.equal(lifetimeBucket(h(24)), '1d_3d');
  assert.equal(lifetimeBucket(h(72)), 'over_3d');
});

test('weeks: Monday buckets in the accountant timezone, empty weeks at zero', () => {
  assert.equal(mondayOf('2026-11-15'), '2026-11-09'); // a Sunday
  assert.equal(mondayOf('2026-11-09'), '2026-11-09');
  assert.equal(mondayOf('2026-11-01'), '2026-10-26');
  const rows: DraftOutcome[] = [];
  // Week of 2 Nov: 10 written, 2 discarded. Week of 16 Nov: 8 written, 5 discarded. Week of 9 Nov: nothing.
  for (let i = 0; i < 8; i++) rows.push(draft({ at: '2026-11-02T10:00:00Z', sent: true }));
  for (let i = 0; i < 2; i++) rows.push(draft({ at: '2026-11-02T10:00:00Z', discardReason: 'client_message', cost: 0.01 }));
  for (let i = 0; i < 3; i++) rows.push(draft({ at: '2026-11-17T10:00:00Z', sent: true }));
  for (let i = 0; i < 5; i++) rows.push(draft({ at: '2026-11-17T10:00:00Z', discardReason: 'client_message', cost: 0.01 }));
  // Saturday 21 Nov 23:30 UTC = Sunday 01:30 Israel → still the week of 16 Nov.
  rows.push(draft({ at: '2026-11-21T23:30:00Z', sent: true }));
  const s = summarize(rows, TZ);
  assert.deepEqual(
    s.weeks.map((w) => [w.weekStart, w.written, w.discarded]),
    [
      ['2026-11-02', 10, 2],
      ['2026-11-09', 0, 0],
      ['2026-11-16', 9, 5],
    ],
  );
  assert.ok(Math.abs(s.weeks[2]!.discardedCost.known - 0.05) < 1e-9);
});

test('top clients: by discarded cost, then count; sent-only clients left out', () => {
  const rows: DraftOutcome[] = [];
  for (let i = 0; i < 9; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', clientId: 'A', clientName: 'A', discardReason: 'client_message', cost: 0.04 / 9 }));
  for (let i = 0; i < 12; i++) rows.push(draft({ at: '2026-11-03T10:00:00Z', clientId: 'B', clientName: 'B', discardReason: 'client_message', cost: 0.02 / 12 }));
  rows.push(draft({ at: '2026-11-03T10:00:00Z', clientId: 'B', clientName: 'B', sent: true }));
  rows.push(draft({ at: '2026-11-03T10:00:00Z', clientId: 'C', clientName: 'C', clientDeleted: true, sent: true }));
  const s = summarize(rows, TZ);
  assert.deepEqual(
    s.topClients.map((c) => [c.clientId, c.discarded, c.written, Math.round(c.discardRate! * 100)]),
    [
      ['A', 9, 9, 100],
      ['B', 12, 13, 92],
    ],
  );
});
