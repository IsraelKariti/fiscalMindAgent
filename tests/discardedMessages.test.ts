import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mondayOf, summarize, type DraftOutcome } from '../src/analytics/discardedMessages.js';

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
    lastInboundAt: null,
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
  rows.push(draft({ at: '2026-11-03T10:00:00Z', planTrigger: 'agent_message_sent', discardReason: 'document_fetch', cost: 0.003 }));
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
});

test('wait curve: share of client-reply discards with client silence under the wait', () => {
  const at = '2026-11-03T07:00:00Z';
  const sec = (n: number) => n * 1000;
  const rows: DraftOutcome[] = [
    // the client's message came 20 s before the draft; silences 40 s, 70 s, 100 s, 20 min
    draft({ at, discardReason: 'client_message', lastInboundAt: plus(at, -sec(20)), discardedAt: plus(at, sec(20)), cost: 0.01 }),
    draft({ at, discardReason: 'client_message', lastInboundAt: plus(at, -sec(20)), discardedAt: plus(at, sec(50)), cost: 0.02 }),
    draft({ at, discardReason: 'client_message', lastInboundAt: plus(at, -sec(20)), discardedAt: plus(at, sec(80)) }),
    draft({ at, discardReason: 'client_message', lastInboundAt: plus(at, -sec(20)), discardedAt: plus(at, 20 * 60_000), cost: 0.04 }),
    // no inbound on record: the silence counts from the written time (30 s)
    draft({ at, discardReason: 'client_message', discardedAt: plus(at, sec(30)), cost: 0.08 }),
    // a file-check discard is not avoided by waiting
    draft({ at, discardReason: 'file_verification', discardedAt: plus(at, sec(30)), cost: 0.16 }),
  ];
  const curve = summarize(rows, TZ).lifetime.waitCurve;
  assert.equal(curve.stepSeconds, 5);
  assert.equal(curve.points.length, 121);
  assert.equal(curve.total, 5);
  // Costs are float sums: compare them in cents.
  const cents = (c: { known: number; unknown: number }) => ({ known: Math.round(c.known * 100), unknown: c.unknown });
  assert.deepEqual(cents(curve.totalCost), { known: 15, unknown: 1 });
  const pointAt = (seconds: number) => {
    const p = curve.points[seconds / 5]!;
    return { avoided: p.avoided, cost: cents(p.cost) };
  };
  assert.deepEqual(pointAt(0), { avoided: 0, cost: { known: 0, unknown: 0 } });
  assert.deepEqual(pointAt(30), { avoided: 0, cost: { known: 0, unknown: 0 } });
  assert.deepEqual(pointAt(35), { avoided: 1, cost: { known: 8, unknown: 0 } });
  assert.deepEqual(pointAt(60), { avoided: 2, cost: { known: 9, unknown: 0 } });
  assert.deepEqual(pointAt(120), { avoided: 4, cost: { known: 11, unknown: 1 } });
  assert.deepEqual(pointAt(600), { avoided: 4, cost: { known: 11, unknown: 1 } });
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
