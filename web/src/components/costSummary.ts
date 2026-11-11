import type { LlmCallSummary } from '../api.js';

/**
 * The admin cost tab's figures (openspec `admin-cost-tab`), derived from the
 * client's recorded LLM calls. Every number is what the calls recorded at call
 * time: an unpriced call (cost null — its model had no price) counts as zero
 * in every sum and is counted in `unpriced`, so the totals read as a floor.
 * Discarded-draft calls and failed calls count like any other: their cost was
 * spent.
 */

export interface CostGroup {
  /** The purpose (call type) or the model name. */
  key: string;
  calls: number;
  failed: number;
  cost: number;
  /** Share of the client's total cost, 0..1 (0 when the total is zero). */
  share: number;
  /** Average cost per call of the group. */
  avg: number;
}

export interface CostDay {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  cost: number;
  calls: number;
}

export interface CostTotals {
  cost: number;
  calls: number;
  failed: number;
  unpriced: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  /** Total cost over the messages the agent delivered; null when none was delivered. */
  costPerMessage: number | null;
}

export interface CostSummary {
  totals: CostTotals;
  /** One row per call type, cost descending. */
  byPurpose: CostGroup[];
  /** One row per model, cost descending. */
  byModel: CostGroup[];
  /** Every local day from the first call to the last, days without calls at zero. */
  byDay: CostDay[];
  /** The five costliest priced calls, costliest first. */
  top: LlmCallSummary[];
}

const TOP_COUNT = 5;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** The browser-local calendar day of an instant. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function groupBy(calls: LlmCallSummary[], keyOf: (c: LlmCallSummary) => string, total: number): CostGroup[] {
  const groups = new Map<string, CostGroup>();
  for (const c of calls) {
    const key = keyOf(c);
    const g = groups.get(key) ?? { key, calls: 0, failed: 0, cost: 0, share: 0, avg: 0 };
    g.calls += 1;
    if (c.status === 'error') g.failed += 1;
    g.cost += c.cost ?? 0;
    groups.set(key, g);
  }
  const rows = [...groups.values()].map((g) => ({
    ...g,
    share: total > 0 ? g.cost / total : 0,
    avg: g.calls > 0 ? g.cost / g.calls : 0,
  }));
  rows.sort((a, b) => b.cost - a.cost || b.calls - a.calls || a.key.localeCompare(b.key));
  return rows;
}

function byDay(calls: LlmCallSummary[]): CostDay[] {
  if (calls.length === 0) return [];
  const perDay = new Map<string, CostDay>();
  let first: Date | null = null;
  let last: Date | null = null;
  for (const c of calls) {
    const at = new Date(c.createdAt);
    if (first === null || at < first) first = at;
    if (last === null || at > last) last = at;
    const day = localDay(at);
    const row = perDay.get(day) ?? { day, cost: 0, calls: 0 };
    row.cost += c.cost ?? 0;
    row.calls += 1;
    perDay.set(day, row);
  }
  const days: CostDay[] = [];
  const cursor = new Date(first!.getFullYear(), first!.getMonth(), first!.getDate());
  const lastDay = localDay(last!);
  for (;;) {
    const day = localDay(cursor);
    days.push(perDay.get(day) ?? { day, cost: 0, calls: 0 });
    if (day === lastDay) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * @param calls every LLM call recorded for the client (any order)
 * @param sentMessages how many messages the agent delivered to the client (outbound, not draft)
 */
export function summarizeCost(calls: LlmCallSummary[], sentMessages: number): CostSummary {
  const totals: CostTotals = {
    cost: 0,
    calls: calls.length,
    failed: 0,
    unpriced: 0,
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cachedTokens: 0,
    costPerMessage: null,
  };
  for (const c of calls) {
    if (c.cost === null) totals.unpriced += 1;
    else totals.cost += c.cost;
    if (c.status === 'error') totals.failed += 1;
    totals.inputTokens += c.inputTokens;
    totals.outputTokens += c.outputTokens;
    totals.thinkingTokens += c.thinkingTokens;
    totals.cachedTokens += c.cachedTokens;
  }
  totals.costPerMessage = sentMessages > 0 ? totals.cost / sentMessages : null;

  const top = calls
    .filter((c) => c.cost !== null)
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, TOP_COUNT);

  return {
    totals,
    byPurpose: groupBy(calls, (c) => c.purpose, totals.cost),
    byModel: groupBy(calls, (c) => c.model, totals.cost),
    byDay: byDay(calls),
    top,
  };
}
