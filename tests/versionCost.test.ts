import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { summarizeVersions, type VersionGroupInput } from '../src/analytics/versionCost.js';

// The admin versions page's figures (openspec `cost-per-version`).

function group(over: Partial<VersionGroupInput> & { appVersion: string | null; purpose: string }): VersionGroupInput {
  return {
    calls: 1,
    failed: 0,
    cost: 0,
    unpriced: 0,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    cycles: 0,
    files: 0,
    firstAt: new Date('2026-11-12T10:00:00Z'),
    lastAt: new Date('2026-11-12T10:00:00Z'),
    ...over,
  };
}

const nov10 = new Date('2026-11-10T08:00:00Z');
const nov12 = new Date('2026-11-12T09:00:00Z');
const nov14 = new Date('2026-11-14T09:00:00Z');

test('versions are ordered by first call, newest first; before-versions last', () => {
  const out = summarizeVersions([
    group({ appVersion: 'c768c49', purpose: 'planner', firstAt: nov10, lastAt: nov10 }),
    group({ appVersion: null, purpose: 'planner', firstAt: new Date('2026-10-01T00:00:00Z'), lastAt: nov14 }),
    group({ appVersion: '1987c49', purpose: 'planner', firstAt: nov12, lastAt: nov14 }),
  ]);
  assert.deepEqual(
    out.map((v) => v.version),
    ['1987c49', 'c768c49', null],
  );
  // The before entry carries no delta and the oldest real version compares with nothing.
  assert.equal(out[1]!.costPerCycleDelta, null);
  assert.equal(out[2]!.costPerCycleDelta, null);
  assert.equal(out[0]!.daysActive, 3);
});

test('cost per cycle and per document, unpriced count, few calls', () => {
  const [v] = summarizeVersions([
    group({ appVersion: 'a', purpose: 'planner', calls: 6, cost: 0.6, cycles: 4, unpriced: 2, inputTokens: 60_000 }),
    group({ appVersion: 'a', purpose: 'extract_document', calls: 4, cost: 0.08, files: 2 }),
  ]);
  assert.equal(v!.calls, 10);
  assert.ok(Math.abs(v!.costPerCycle! - 0.15) < 1e-12);
  assert.ok(Math.abs(v!.costPerDocument! - 0.04) < 1e-12);
  assert.equal(v!.plannerInputTokensAvg, 10_000);
  assert.equal(v!.unpriced, 2);
  assert.equal(v!.fewCalls, false);
  assert.equal(v!.cycles, 4);
  assert.equal(v!.documents, 2);
});

test('a version without cycles or extractions shows no per-unit figure', () => {
  const [v] = summarizeVersions([group({ appVersion: 'a', purpose: 'file_classification', calls: 4, cost: 0.01 })]);
  assert.equal(v!.costPerCycle, null);
  assert.equal(v!.costPerDocument, null);
  assert.equal(v!.plannerInputTokensAvg, null);
  assert.equal(v!.fewCalls, true);
});

test('stage rows: sorted by cost, averages and cache share', () => {
  const [v] = summarizeVersions([
    group({ appVersion: 'a', purpose: 'file_classification', calls: 2, cost: 0.02, inputTokens: 10_000, cachedTokens: 7_500, outputTokens: 100, thinkingTokens: 300 }),
    group({ appVersion: 'a', purpose: 'planner', calls: 4, cost: 0.4, cycles: 4, inputTokens: 80_000, failed: 1 }),
  ]);
  assert.deepEqual(
    v!.stages.map((s) => s.purpose),
    ['planner', 'file_classification'],
  );
  const cls = v!.stages[1]!;
  assert.equal(cls.cacheShare, 0.75);
  // Input tokens shown = full price only: (10,000 - 7,500 cached) / 2 calls.
  assert.equal(cls.avgInputTokens, 1_250);
  assert.equal(cls.avgOutputTokens, 200);
  assert.equal(cls.avgCost, 0.01);
  assert.equal(v!.stages[0]!.failed, 1);
  assert.equal(v!.failed, 1);
});

test('average input tokens leave out cached and cache-write tokens', () => {
  const [v] = summarizeVersions([
    group({ appVersion: 'a', purpose: 'planner', calls: 2, cost: 0.19, cycles: 1, inputTokens: 107_138, cachedTokens: 85_536 }),
    group({ appVersion: 'a', purpose: 'extract_document', calls: 1, cost: 0.3, files: 1, inputTokens: 52_000, cacheWriteTokens: 45_000 }),
  ]);
  assert.equal(v!.plannerInputTokensAvg, 10_801);
  const extraction = v!.stages.find((s) => s.purpose === 'extract_document')!;
  assert.equal(extraction.avgInputTokens, 7_000);
  // Cache share stays over all prompt tokens.
  assert.equal(v!.stages.find((s) => s.purpose === 'planner')!.cacheShare, 85_536 / 107_138);
});

test('deltas against the previous version: cheaper cycle, more tokens, missing stage', () => {
  const out = summarizeVersions([
    group({ appVersion: 'old', purpose: 'planner', calls: 5, cost: 1.0, cycles: 5, inputTokens: 100_000, firstAt: nov10, lastAt: nov10 }),
    group({ appVersion: 'old', purpose: 'extract_document', calls: 2, cost: 0.1, files: 2, firstAt: nov10, lastAt: nov10 }),
    group({ appVersion: 'new', purpose: 'planner', calls: 10, cost: 1.5, cycles: 10, inputTokens: 220_000, firstAt: nov12, lastAt: nov14 }),
    group({ appVersion: 'new', purpose: 'file_splitting', calls: 1, cost: 0.01, firstAt: nov12, lastAt: nov12 }),
  ]);
  const [cur, prev] = out;
  assert.equal(cur!.version, 'new');
  assert.ok(Math.abs(cur!.costPerCycleDelta! - -0.25) < 1e-12);
  assert.ok(Math.abs(cur!.plannerInputTokensDelta! - 0.1) < 1e-12);
  // No extraction in the new version → no figure, no delta.
  assert.equal(cur!.costPerDocument, null);
  assert.equal(cur!.costPerDocumentDelta, null);
  // Planner stage compares; the splitting stage has no counterpart.
  const planner = cur!.stages.find((s) => s.purpose === 'planner')!;
  assert.ok(Math.abs(planner.avgCostDelta! - -0.25) < 1e-12);
  assert.ok(Math.abs(planner.avgInputTokensDelta! - 0.1) < 1e-12);
  assert.equal(cur!.stages.find((s) => s.purpose === 'file_splitting')!.avgCostDelta, null);
  // The oldest version compares with nothing.
  assert.equal(prev!.costPerCycleDelta, null);
  assert.equal(prev!.plannerInputTokensDelta, null);
});

test('a previous figure of zero gives no delta', () => {
  const out = summarizeVersions([
    group({ appVersion: 'old', purpose: 'planner', calls: 2, cost: 0, cycles: 2, firstAt: nov10, lastAt: nov10 }),
    group({ appVersion: 'new', purpose: 'planner', calls: 2, cost: 0.2, cycles: 2, firstAt: nov12, lastAt: nov12 }),
  ]);
  assert.equal(out[0]!.costPerCycleDelta, null);
});
