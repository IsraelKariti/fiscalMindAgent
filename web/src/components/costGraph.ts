import type { LlmCallSummary } from '../api.js';
import { localDay } from './costSummary.js';

/**
 * The admin cost graph tab's figures (openspec `admin-cost-graph-tab`): the
 * client's recorded LLM calls filtered by type, model and local-day range,
 * then bucketed by day, week (Monday) or month in the browser's local time.
 * Every number is what the calls recorded at call time; an unpriced call
 * (cost null) counts as zero cost and is counted in `summary.unpriced`.
 * Pure: `today` is a parameter, nothing reads the clock.
 */

export type GroupBy = 'day' | 'week' | 'month';
export type Measure = 'cost' | 'calls' | 'tokens';
export type RangePreset = 7 | 30 | 90 | 'all';

/** Lines drawn when no type is chosen; the rest merge into OTHER_KEY. */
export const MAX_LINES = 6;
export const OTHER_KEY = '__other__';
/** Hard cap on buckets so a wild custom range cannot freeze the tab. */
const MAX_BUCKETS = 5000;

export interface LifeRange {
  /** Local day of the client's first call, YYYY-MM-DD. */
  first: string;
  /** Local day of the client's last call, YYYY-MM-DD. */
  last: string;
}

export interface CostGraphOptions {
  /** Distinct call types, total cost descending. */
  purposes: string[];
  /** Distinct models, total cost descending. */
  models: string[];
  /** null when the client has no calls. */
  life: LifeRange | null;
}

export interface BucketQuery {
  /** null = all types. */
  purpose: string | null;
  /** null = all models. */
  model: string | null;
  /** Inclusive local days, YYYY-MM-DD. */
  from: string;
  to: string;
  groupBy: GroupBy;
  measure: Measure;
}

export interface CostGraphSeries {
  /** A purpose, or OTHER_KEY for the merged remainder. */
  key: string;
  /** One value per bucket, in bucket order. */
  values: number[];
}

export interface CostGraph {
  /** Bucket start days (YYYY-MM-DD), oldest first; empty when from > to. */
  keys: string[];
  /** One line per type (capped) or the single chosen type; empty when no call is included. */
  series: CostGraphSeries[];
  /** Included calls of each bucket, newest first. */
  buckets: LlmCallSummary[][];
  /** Over every included call, independent of grouping and measure. */
  summary: { calls: number; cost: number; unpriced: number };
}

/** YYYY-MM-DD → local midnight. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Monday of the week holding `d` (same rule as charts/weeks.ts, which the node tests cannot import). */
function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function bucketStart(d: Date, groupBy: GroupBy): Date {
  if (groupBy === 'week') return startOfWeek(d);
  if (groupBy === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nextBucket(d: Date, groupBy: GroupBy): Date {
  if (groupBy === 'week') return addDays(d, 7);
  if (groupBy === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return addDays(d, 1);
}

function tokensOf(c: LlmCallSummary): number {
  return c.inputTokens + c.outputTokens + c.thinkingTokens;
}

function valueOf(c: LlmCallSummary, measure: Measure): number {
  if (measure === 'calls') return 1;
  if (measure === 'tokens') return tokensOf(c);
  return c.cost ?? 0;
}

function sortedByCost(calls: LlmCallSummary[], keyOf: (c: LlmCallSummary) => string): string[] {
  const totals = new Map<string, number>();
  for (const c of calls) totals.set(keyOf(c), (totals.get(keyOf(c)) ?? 0) + (c.cost ?? 0));
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

/** The select entries and the client's life range, from every recorded call. */
export function costGraphOptions(calls: LlmCallSummary[]): CostGraphOptions {
  let first: string | null = null;
  let last: string | null = null;
  for (const c of calls) {
    const day = localDay(new Date(c.createdAt));
    if (first === null || day < first) first = day;
    if (last === null || day > last) last = day;
  }
  return {
    purposes: sortedByCost(calls, (c) => c.purpose),
    models: sortedByCost(calls, (c) => c.model),
    life: first !== null && last !== null ? { first, last } : null,
  };
}

/**
 * The from/to pair of a preset: N days = the last N local days ending `today`
 * inclusive; all = the client's life (today alone when the client has no calls).
 */
export function presetRange(preset: RangePreset, today: string, life: LifeRange | null): { from: string; to: string } {
  if (preset === 'all') return life ? { from: life.first, to: life.last } : { from: today, to: today };
  return { from: localDay(addDays(parseDay(today), -(preset - 1))), to: today };
}

/** Filter the calls by the query and bucket them; see the module comment. */
export function bucketCalls(calls: LlmCallSummary[], q: BucketQuery): CostGraph {
  const empty: CostGraph = { keys: [], series: [], buckets: [], summary: { calls: 0, cost: 0, unpriced: 0 } };
  if (q.from > q.to) return empty;

  const included = calls.filter((c) => {
    if (q.purpose !== null && c.purpose !== q.purpose) return false;
    if (q.model !== null && c.model !== q.model) return false;
    const day = localDay(new Date(c.createdAt));
    return day >= q.from && day <= q.to;
  });
  included.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const summary = { calls: included.length, cost: 0, unpriced: 0 };
  for (const c of included) {
    if (c.cost === null) summary.unpriced += 1;
    else summary.cost += c.cost;
  }

  const keys: string[] = [];
  const index = new Map<string, number>();
  const end = bucketStart(parseDay(q.to), q.groupBy);
  for (let cursor = bucketStart(parseDay(q.from), q.groupBy); cursor <= end && keys.length < MAX_BUCKETS; cursor = nextBucket(cursor, q.groupBy)) {
    const key = localDay(cursor);
    index.set(key, keys.length);
    keys.push(key);
  }
  const buckets: LlmCallSummary[][] = keys.map(() => []);
  const bucketOf = (c: LlmCallSummary) => index.get(localDay(bucketStart(new Date(c.createdAt), q.groupBy)));
  for (const c of included) {
    const i = bucketOf(c);
    if (i !== undefined) buckets[i]!.push(c);
  }

  if (included.length === 0) return { ...empty, keys, buckets };

  // Which line each call lands on: its own type, or the merged remainder.
  const totals = new Map<string, number>();
  for (const c of included) totals.set(c.purpose, (totals.get(c.purpose) ?? 0) + valueOf(c, q.measure));
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  const own = q.purpose !== null ? ranked : ranked.length > MAX_LINES ? ranked.slice(0, MAX_LINES) : ranked;
  const lineOf = (purpose: string) => (own.includes(purpose) ? purpose : OTHER_KEY);
  const lineKeys = ranked.length > own.length ? [...own, OTHER_KEY] : own;

  const series: CostGraphSeries[] = lineKeys.map((key) => ({ key, values: keys.map(() => 0) }));
  const seriesIndex = new Map(lineKeys.map((k, i) => [k, i]));
  for (const c of included) {
    const b = bucketOf(c);
    const s = seriesIndex.get(lineOf(c.purpose));
    if (b !== undefined && s !== undefined) series[s]!.values[b] = (series[s]!.values[b] ?? 0) + valueOf(c, q.measure);
  }

  return { keys, series, buckets, summary };
}

/** `2026-03-05` + groupBy → the text under the axis. */
export function bucketLabel(key: string, groupBy: GroupBy, locale: string): string {
  const d = parseDay(key);
  if (groupBy === 'month') return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
