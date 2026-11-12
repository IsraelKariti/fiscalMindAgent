import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LlmCallSummary } from '../web/src/api.js';
import { bucketCalls, costGraphOptions, MAX_LINES, OTHER_KEY, presetRange, type BucketQuery } from '../web/src/components/costGraph.js';

// The admin cost graph tab's filter + bucketing module (openspec `admin-cost-graph-tab`).
// Times are local noon so the local day never straddles a UTC boundary.

let seq = 0;
function call(over: Partial<LlmCallSummary>): LlmCallSummary {
  seq += 1;
  return {
    id: `call-${seq}`,
    createdAt: new Date(2026, 2, 1, 12).toISOString(),
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

/** Local noon of a 2026 day (month 1-based). */
function at(month: number, day: number): string {
  return new Date(2026, month - 1, day, 12).toISOString();
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
}

const base: BucketQuery = { purpose: null, model: null, from: '2026-03-01', to: '2026-03-31', groupBy: 'day', measure: 'cost' };

test('options list types and models by total cost, and the life range', () => {
  const o = costGraphOptions([
    call({ purpose: 'extract_document', model: 'claude-sonnet-4-5', cost: 0.05, createdAt: at(2, 10) }),
    call({ purpose: 'planner', cost: 0.01, createdAt: at(3, 3) }),
    call({ purpose: 'planner', cost: 0.01, createdAt: at(1, 20) }),
  ]);
  assert.deepEqual(o.purposes, ['extract_document', 'planner']);
  assert.deepEqual(o.models, ['claude-sonnet-4-5', 'gemini-2.5-pro']);
  assert.deepEqual(o.life, { first: '2026-01-20', last: '2026-03-03' });
});

test('no calls gives empty options and no life range', () => {
  const o = costGraphOptions([]);
  assert.deepEqual(o, { purposes: [], models: [], life: null });
});

test('type and model filters combine', () => {
  const calls = [
    call({ purpose: 'planner', model: 'gemini-2.5-pro', cost: 0.01 }),
    call({ purpose: 'planner', model: 'claude-sonnet-4-5', cost: 0.02 }),
    call({ purpose: 'extract_document', model: 'gemini-2.5-pro', cost: 0.04 }),
  ];
  const g = bucketCalls(calls, { ...base, purpose: 'planner', model: 'gemini-2.5-pro' });
  assert.equal(g.summary.calls, 1);
  near(g.summary.cost, 0.01);
  assert.equal(g.series.length, 1);
  assert.equal(g.series[0]!.key, 'planner');
  assert.equal(g.buckets[0]!.length, 1);
});

test('the date range is inclusive on local days', () => {
  const calls = [
    call({ createdAt: at(2, 28), cost: 0.01 }),
    call({ createdAt: at(3, 1), cost: 0.02 }),
    call({ createdAt: at(3, 5), cost: 0.04 }),
    call({ createdAt: at(3, 6), cost: 0.08 }),
  ];
  const g = bucketCalls(calls, { ...base, from: '2026-03-01', to: '2026-03-05' });
  assert.deepEqual(g.keys, ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']);
  assert.equal(g.summary.calls, 2);
  near(g.summary.cost, 0.06);
  assert.deepEqual(g.series[0]!.values.map((v) => Math.round(v * 100)), [2, 0, 0, 0, 4]);
});

test('week buckets start on Monday and keep a zero gap', () => {
  // 1 March 2026 is a Sunday; its week starts Monday 23 February.
  const calls = [call({ createdAt: at(3, 1), cost: 0.01 }), call({ createdAt: at(3, 10), cost: 0.02 })];
  const g = bucketCalls(calls, { ...base, from: '2026-03-01', to: '2026-03-15', groupBy: 'week' });
  assert.deepEqual(g.keys, ['2026-02-23', '2026-03-02', '2026-03-09']);
  assert.deepEqual(g.series[0]!.values.map((v) => Math.round(v * 100)), [1, 0, 2]);
});

test('month buckets with the tokens measure', () => {
  const calls = [
    call({ createdAt: at(1, 20), inputTokens: 1000, outputTokens: 150, thinkingTokens: 50 }),
    call({ createdAt: at(3, 2), inputTokens: 200, outputTokens: 100, thinkingTokens: 0 }),
    call({ createdAt: at(1, 10), inputTokens: 999, outputTokens: 0, thinkingTokens: 0 }), // before the range
  ];
  const g = bucketCalls(calls, { ...base, from: '2026-01-15', to: '2026-03-10', groupBy: 'month', measure: 'tokens' });
  assert.deepEqual(g.keys, ['2026-01-01', '2026-02-01', '2026-03-01']);
  assert.deepEqual(g.series[0]!.values, [1200, 0, 300]);
});

test('calls measure counts one per call, cached tokens are not tokens', () => {
  const calls = [call({ cachedTokens: 5000 }), call({ cost: null })];
  const g = bucketCalls(calls, { ...base, measure: 'calls' });
  assert.equal(g.series[0]!.values[0], 2);
});

test('unpriced counts as zero cost and is counted; failed calls are included', () => {
  const calls = [call({ cost: 0.0042 }), call({ cost: null }), call({ cost: 0.001, status: 'error' })];
  const g = bucketCalls(calls, base);
  assert.equal(g.summary.calls, 3);
  near(g.summary.cost, 0.0052);
  assert.equal(g.summary.unpriced, 1);
  near(g.series[0]!.values[0]!, 0.0052);
});

test('bucket calls are listed newest first', () => {
  const calls = [
    call({ id: 'old', createdAt: new Date(2026, 2, 3, 9).toISOString() }),
    call({ id: 'new', createdAt: new Date(2026, 2, 3, 15).toISOString() }),
  ];
  const g = bucketCalls(calls, base);
  assert.deepEqual(g.buckets[2]!.map((c) => c.id), ['new', 'old']);
});

test('with no type chosen the costliest six types get lines and the rest merge into other', () => {
  const calls: LlmCallSummary[] = [];
  for (let i = 0; i < MAX_LINES + 2; i++) calls.push(call({ purpose: `type_${i}`, cost: 0.01 * (i + 1) }));
  const g = bucketCalls(calls, base);
  assert.equal(g.series.length, MAX_LINES + 1);
  assert.equal(g.series[0]!.key, `type_${MAX_LINES + 1}`);
  assert.equal(g.series[MAX_LINES]!.key, OTHER_KEY);
  // The two cheapest types (0.01 + 0.02) are the remainder.
  near(g.series[MAX_LINES]!.values[0]!, 0.03);
});

test('exactly six types get six lines and no other', () => {
  const calls: LlmCallSummary[] = [];
  for (let i = 0; i < MAX_LINES; i++) calls.push(call({ purpose: `type_${i}` }));
  const g = bucketCalls(calls, base);
  assert.equal(g.series.length, MAX_LINES);
  assert.ok(!g.series.some((s) => s.key === OTHER_KEY));
});

test('a chosen type gives a single series', () => {
  const calls = [call({ purpose: 'planner' }), call({ purpose: 'extract_document' })];
  const g = bucketCalls(calls, { ...base, purpose: 'extract_document' });
  assert.deepEqual(g.series.map((s) => s.key), ['extract_document']);
});

test('from after to gives no buckets and no series', () => {
  const g = bucketCalls([call({})], { ...base, from: '2026-03-10', to: '2026-03-01' });
  assert.deepEqual(g.keys, []);
  assert.deepEqual(g.series, []);
  assert.equal(g.summary.calls, 0);
});

test('nothing in range keeps the axis but has no series', () => {
  const g = bucketCalls([call({ createdAt: at(1, 1) })], { ...base, from: '2026-03-01', to: '2026-03-03' });
  assert.equal(g.keys.length, 3);
  assert.deepEqual(g.series, []);
  assert.deepEqual(g.summary, { calls: 0, cost: 0, unpriced: 0 });
});

test('presets: N days end today inclusive, all is the life range', () => {
  assert.deepEqual(presetRange(7, '2026-11-12', null), { from: '2026-11-06', to: '2026-11-12' });
  assert.deepEqual(presetRange(30, '2026-03-05', null), { from: '2026-02-04', to: '2026-03-05' });
  assert.deepEqual(presetRange('all', '2026-11-12', { first: '2026-01-20', last: '2026-03-03' }), { from: '2026-01-20', to: '2026-03-03' });
  assert.deepEqual(presetRange('all', '2026-11-12', null), { from: '2026-11-12', to: '2026-11-12' });
});
