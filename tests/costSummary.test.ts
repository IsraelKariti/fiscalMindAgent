import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LlmCallSummary } from '../web/src/api.js';
import { localDay, summarizeCost } from '../web/src/components/costSummary.js';

// The admin cost tab's aggregator (openspec `admin-cost-tab`).

let seq = 0;
function call(over: Partial<LlmCallSummary>): LlmCallSummary {
  seq += 1;
  return {
    id: `call-${seq}`,
    createdAt: '2026-03-01T12:00:00.000Z',
    userId: null,
    agentInstanceId: null,
    clientId: 'client',
    clientName: null,
    documentFileId: null,
    documentFileName: null,
    purpose: 'planner',
    provider: 'google',
    model: 'gemini-2.5-pro',
    status: 'ok',
    error: null,
    attempts: 1,
    durationMs: 100,
    inputTokens: 10,
    outputTokens: 5,
    thinkingTokens: 0,
    cachedTokens: 0,
    inputPricePerToken: null,
    outputPricePerToken: null,
    thinkingPricePerToken: null,
    cachedPricePerToken: null,
    cost: 0.01,
    ...over,
  };
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

test('empty trail gives zero totals, no groups and no cost per message', () => {
  const s = summarizeCost([], 0);
  assert.deepEqual(s.totals, {
    cost: 0,
    calls: 0,
    failed: 0,
    unpriced: 0,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cachedTokens: 0,
    costPerMessage: null,
  });
  assert.deepEqual(s.byPurpose, []);
  assert.deepEqual(s.byModel, []);
  assert.deepEqual(s.byDay, []);
  assert.deepEqual(s.top, []);
});

test('unpriced calls count as zero and are counted; failed and discarded calls keep their cost', () => {
  const s = summarizeCost(
    [
      call({ cost: 0.0042 }),
      call({ cost: 0.01, status: 'error', error: 'boom' }),
      call({ cost: null, model: 'mystery' }),
      call({ cost: 0.003, discarded: true }),
    ],
    0,
  );
  near(s.totals.cost, 0.0172);
  assert.equal(s.totals.calls, 4);
  assert.equal(s.totals.failed, 1);
  assert.equal(s.totals.unpriced, 1);
  assert.equal(s.totals.costPerMessage, null);
  assert.equal(s.totals.inputTokens, 40);
  assert.equal(s.totals.outputTokens, 20);
});

test('cost per message divides the total by the delivered messages', () => {
  const s = summarizeCost([call({ cost: 0.3 }), call({ cost: 0.12 })], 4);
  near(s.totals.costPerMessage!, 0.105);
});

test('groups by type: cost descending, with calls, failed, share and average', () => {
  const s = summarizeCost(
    [
      call({ purpose: 'planner', cost: 0.01 }),
      call({ purpose: 'planner', cost: 0.01, status: 'error' }),
      call({ purpose: 'planner', cost: 0.01 }),
      call({ purpose: 'extract_document', cost: 0.01, model: 'claude-sonnet-4-5' }),
    ],
    0,
  );
  assert.equal(s.byPurpose.length, 2);
  assert.equal(s.byPurpose[0]!.key, 'planner');
  assert.equal(s.byPurpose[0]!.calls, 3);
  assert.equal(s.byPurpose[0]!.failed, 1);
  near(s.byPurpose[0]!.cost, 0.03);
  near(s.byPurpose[0]!.share, 0.75);
  near(s.byPurpose[0]!.avg, 0.01);
  assert.equal(s.byPurpose[1]!.key, 'extract_document');
  near(s.byPurpose[1]!.share, 0.25);

  assert.deepEqual(
    s.byModel.map((g) => [g.key, g.calls]),
    [
      ['gemini-2.5-pro', 3],
      ['claude-sonnet-4-5', 1],
    ],
  );
  near(s.byModel[0]!.share, 0.75);
});

test('a type whose calls are all unpriced has zero cost and zero share', () => {
  const s = summarizeCost([call({ purpose: 'planner', cost: 0.01 }), call({ purpose: 'file_splitting', cost: null })], 0);
  const split = s.byPurpose.find((g) => g.key === 'file_splitting')!;
  assert.equal(split.cost, 0);
  assert.equal(split.share, 0);
  assert.equal(split.avg, 0);
});

test('shares are zero when nothing is priced', () => {
  const s = summarizeCost([call({ cost: null }), call({ cost: null })], 1);
  assert.equal(s.totals.cost, 0);
  assert.equal(s.byPurpose[0]!.share, 0);
  near(s.totals.costPerMessage!, 0);
  assert.deepEqual(s.top, []);
});

test('days run from the first call to the last, gaps at zero, in local days', () => {
  const d1 = new Date(2026, 2, 1, 12, 0, 0); // 1 March, local noon
  const d3 = new Date(2026, 2, 3, 9, 30, 0);
  const s = summarizeCost(
    [
      call({ createdAt: d3.toISOString(), cost: 0.015 }),
      call({ createdAt: d1.toISOString(), cost: 0.01 }),
      call({ createdAt: d3.toISOString(), cost: 0.005 }),
    ],
    0,
  );
  assert.deepEqual(
    s.byDay.map((d) => [d.day, d.calls]),
    [
      [localDay(d1), 1],
      ['2026-03-02', 0],
      [localDay(d3), 2],
    ],
  );
  near(s.byDay[0]!.cost, 0.01);
  assert.equal(s.byDay[1]!.cost, 0);
  near(s.byDay[2]!.cost, 0.02);
});

test('top lists at most five priced calls, costliest first', () => {
  const calls = [0.01, 0.05, null, 0.02, 0.04, 0.03, 0.06].map((cost) => call({ cost }));
  const s = summarizeCost(calls, 0);
  assert.deepEqual(
    s.top.map((c) => c.cost),
    [0.06, 0.05, 0.04, 0.03, 0.02],
  );
  // The input order is untouched.
  assert.equal(calls[0]!.cost, 0.01);
});

test('fewer than five priced calls lists them all', () => {
  const s = summarizeCost([call({ cost: 0.01 }), call({ cost: 0.02 }), call({ cost: null })], 0);
  assert.deepEqual(
    s.top.map((c) => c.cost),
    [0.02, 0.01],
  );
});
