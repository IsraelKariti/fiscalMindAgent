import type { DiscardReason, PlanTrigger } from '../db/types.js';

/**
 * The admin analytics tab's figures (openspec `discarded-message-analytics`),
 * computed from the outbound drafts of one agent instance. Pure: the route
 * loads the rows (db/queries/draftOutcomes.ts) and calls `summarize`.
 *
 * Vocabulary: a draft is "discarded" when it carries a discard reason (the
 * cancel stamped it, or the 076 backfill marked it `unknown`); "sent" when its
 * status is sent; "pending" otherwise (queued or held, still alive at load
 * time). Cost is per draft: the recorded cost of its planning cycle's calls,
 * null = unknown (pre-076 draft, or every call unpriced) — never zero.
 */
export interface DraftOutcome {
  id: string;
  clientId: string;
  clientName: string;
  clientDeleted: boolean;
  sent: boolean;
  createdAt: Date;
  planTrigger: PlanTrigger | null;
  scheduledFor: Date | null;
  discardedAt: Date | null;
  discardReason: DiscardReason | null;
  cost: number | null;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A 10-second bucket below 3 minutes: `0s_10s` … `170s_180s`. */
type SecondsBucket = `${number}s_${number}s`;
/** A one-minute bucket from 3 to 10 minutes: `3m_4m` … `9m_10m`. */
type MinutesBucket = `${number}m_${number}m`;
type CoarseBucket = '10m_1h' | '1h_6h' | '6h_24h' | '1d_3d' | 'over_3d';
export type LifetimeBucket = SecondsBucket | MinutesBucket | CoarseBucket;

const SECONDS_BUCKETS: SecondsBucket[] = Array.from({ length: 18 }, (_, i) => `${i * 10}s_${(i + 1) * 10}s` as const);
const MINUTES_BUCKETS: MinutesBucket[] = Array.from({ length: 7 }, (_, i) => `${i + 3}m_${i + 4}m` as const);
const COARSE_BUCKETS: CoarseBucket[] = ['10m_1h', '1h_6h', '6h_24h', '1d_3d', 'over_3d'];

/**
 * Time-alive buckets of a discarded draft, in display order: every 10 s up to
 * 3 min, every minute up to 10 min, then coarse (30 buckets).
 */
export const LIFETIME_BUCKETS: readonly LifetimeBucket[] = [...SECONDS_BUCKETS, ...MINUTES_BUCKETS, ...COARSE_BUCKETS];

export function lifetimeBucket(ms: number): LifetimeBucket {
  const alive = Math.max(0, ms);
  if (alive < 3 * MINUTE) {
    const i = Math.floor(alive / (10 * SECOND));
    return `${i * 10}s_${(i + 1) * 10}s`;
  }
  if (alive < 10 * MINUTE) {
    const m = Math.floor(alive / MINUTE);
    return `${m}m_${m + 1}m`;
  }
  if (ms < HOUR) return '10m_1h';
  if (ms < 6 * HOUR) return '1h_6h';
  if (ms < DAY) return '6h_24h';
  if (ms < 3 * DAY) return '1d_3d';
  return 'over_3d';
}

export interface CostSum {
  /** Sum of the known costs. */
  known: number;
  /** How many of the counted drafts have an unknown cost (the UI shows a `+`). */
  unknown: number;
}

export interface Tiles {
  written: number;
  sent: number;
  discarded: number;
  pending: number;
  /** discarded ÷ written, 0..1; null when nothing was written. */
  discardRate: number | null;
  discardedCost: CostSum;
  allCost: CostSum;
  /** discarded known cost ÷ all known cost, 0..1; null when no known cost. */
  wasteShare: number | null;
}

export interface ReasonRow {
  reason: DiscardReason;
  count: number;
  /** count ÷ all discards, 0..1. */
  share: number;
  cost: CostSum;
}

export interface TriggerRow {
  /** null = the draft predates the trigger column and the backfill could not name one (never happens after 076, kept for safety). */
  trigger: PlanTrigger | null;
  written: number;
  sent: number;
  discarded: number;
  discardRate: number | null;
  discardedCost: CostSum;
  /** The most common discard reason of this trigger's discards; null without discards. */
  topReason: DiscardReason | null;
}

export interface Lifetime {
  /** Discarded drafts with a known discard time. */
  known: number;
  medianMs: number | null;
  averageMs: number | null;
  /** Drafts with both a discard time and a planned send time after the write. */
  waitShareKnown: number;
  /** Median of (time alive ÷ planned wait), capped at 1. */
  medianWaitShare: number | null;
  histogram: { bucket: LifetimeBucket; count: number }[];
}

export interface WeekRow {
  /** The Monday, as YYYY-MM-DD in the accountant timezone. */
  weekStart: string;
  written: number;
  discarded: number;
  discardedCost: CostSum;
}

export interface ClientRow {
  clientId: string;
  name: string;
  deleted: boolean;
  written: number;
  discarded: number;
  discardRate: number | null;
  discardedCost: CostSum;
}

export interface Summary {
  tiles: Tiles;
  reasons: ReasonRow[];
  triggers: TriggerRow[];
  lifetime: Lifetime;
  weeks: WeekRow[];
  topClients: ClientRow[];
}

export const TOP_CLIENTS = 10;

function emptyCost(): CostSum {
  return { known: 0, unknown: 0 };
}

function addCost(sum: CostSum, cost: number | null): void {
  if (cost == null) sum.unknown += 1;
  else sum.known += cost;
}

function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function isDiscarded(d: DraftOutcome): boolean {
  return d.discardReason != null;
}

/** The instant's calendar day in `timeZone`, as YYYY-MM-DD. */
function dayIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** The Monday of the week holding `day` (YYYY-MM-DD), as YYYY-MM-DD. Pure calendar arithmetic, no zone. */
export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  const back = (utc.getUTCDay() + 6) % 7; // Monday-based
  utc.setUTCDate(utc.getUTCDate() - back);
  return utc.toISOString().slice(0, 10);
}

function nextMonday(monday: string): string {
  const [y, m, d] = monday.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d + 7));
  return utc.toISOString().slice(0, 10);
}

/**
 * Every figure of the tab for the given drafts (already filtered to the range
 * by the day they were written). `timeZone` buckets the weeks.
 */
export function summarize(drafts: readonly DraftOutcome[], timeZone: string): Summary {
  const tiles: Tiles = {
    written: drafts.length,
    sent: 0,
    discarded: 0,
    pending: 0,
    discardRate: null,
    discardedCost: emptyCost(),
    allCost: emptyCost(),
    wasteShare: null,
  };
  const reasons = new Map<DiscardReason, ReasonRow>();
  const triggers = new Map<PlanTrigger | null, TriggerRow & { reasonCounts: Map<DiscardReason, number> }>();
  const weeks = new Map<string, WeekRow>();
  const clients = new Map<string, ClientRow>();
  const lifetimes: number[] = [];
  const waitShares: number[] = [];
  const histogram = new Map<LifetimeBucket, number>(LIFETIME_BUCKETS.map((b) => [b, 0]));

  for (const d of drafts) {
    const discarded = isDiscarded(d);
    addCost(tiles.allCost, d.cost);
    if (d.sent) tiles.sent += 1;
    else if (discarded) tiles.discarded += 1;
    else tiles.pending += 1;

    let trig = triggers.get(d.planTrigger);
    if (!trig) {
      trig = { trigger: d.planTrigger, written: 0, sent: 0, discarded: 0, discardRate: null, discardedCost: emptyCost(), topReason: null, reasonCounts: new Map() };
      triggers.set(d.planTrigger, trig);
    }
    trig.written += 1;
    if (d.sent) trig.sent += 1;

    const weekStart = mondayOf(dayIn(d.createdAt, timeZone));
    let week = weeks.get(weekStart);
    if (!week) {
      week = { weekStart, written: 0, discarded: 0, discardedCost: emptyCost() };
      weeks.set(weekStart, week);
    }
    week.written += 1;

    let client = clients.get(d.clientId);
    if (!client) {
      client = { clientId: d.clientId, name: d.clientName, deleted: d.clientDeleted, written: 0, discarded: 0, discardRate: null, discardedCost: emptyCost() };
      clients.set(d.clientId, client);
    }
    client.written += 1;

    if (!discarded || d.sent) continue;
    const reason = d.discardReason!;
    addCost(tiles.discardedCost, d.cost);

    let row = reasons.get(reason);
    if (!row) {
      row = { reason, count: 0, share: 0, cost: emptyCost() };
      reasons.set(reason, row);
    }
    row.count += 1;
    addCost(row.cost, d.cost);

    trig.discarded += 1;
    addCost(trig.discardedCost, d.cost);
    trig.reasonCounts.set(reason, (trig.reasonCounts.get(reason) ?? 0) + 1);

    week.discarded += 1;
    addCost(week.discardedCost, d.cost);

    client.discarded += 1;
    addCost(client.discardedCost, d.cost);

    if (d.discardedAt) {
      const alive = Math.max(0, d.discardedAt.getTime() - d.createdAt.getTime());
      lifetimes.push(alive);
      histogram.set(lifetimeBucket(alive), (histogram.get(lifetimeBucket(alive)) ?? 0) + 1);
      if (d.scheduledFor) {
        const wait = d.scheduledFor.getTime() - d.createdAt.getTime();
        if (wait > 0) waitShares.push(Math.min(1, alive / wait));
      }
    }
  }

  tiles.discardRate = rate(tiles.discarded, tiles.written);
  tiles.wasteShare = tiles.allCost.known > 0 ? tiles.discardedCost.known / tiles.allCost.known : null;

  const reasonRows = [...reasons.values()]
    .map((r) => ({ ...r, share: r.count / tiles.discarded }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  const triggerRows: TriggerRow[] = [...triggers.values()]
    .map(({ reasonCounts, ...t }) => {
      let topReason: DiscardReason | null = null;
      let top = 0;
      for (const [reason, count] of reasonCounts) {
        if (count > top) {
          top = count;
          topReason = reason;
        }
      }
      return { ...t, discardRate: rate(t.discarded, t.written), topReason };
    })
    .sort((a, b) => b.discardedCost.known - a.discardedCost.known || b.discarded - a.discarded || b.written - a.written);

  // Every week from the first to the last, empty ones at zero.
  const weekRows: WeekRow[] = [];
  if (weeks.size > 0) {
    const starts = [...weeks.keys()].sort();
    for (let w = starts[0]!; w <= starts[starts.length - 1]!; w = nextMonday(w)) {
      weekRows.push(weeks.get(w) ?? { weekStart: w, written: 0, discarded: 0, discardedCost: emptyCost() });
    }
  }

  const topClients = [...clients.values()]
    .filter((c) => c.discarded > 0)
    .map((c) => ({ ...c, discardRate: rate(c.discarded, c.written) }))
    .sort((a, b) => b.discardedCost.known - a.discardedCost.known || b.discarded - a.discarded || a.name.localeCompare(b.name))
    .slice(0, TOP_CLIENTS);

  const avg = lifetimes.length ? lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length : null;
  return {
    tiles,
    reasons: reasonRows,
    triggers: triggerRows,
    lifetime: {
      known: lifetimes.length,
      medianMs: median(lifetimes),
      averageMs: avg,
      waitShareKnown: waitShares.length,
      medianWaitShare: median(waitShares),
      histogram: LIFETIME_BUCKETS.map((bucket) => ({ bucket, count: histogram.get(bucket) ?? 0 })),
    },
    weeks: weekRows,
    topClients,
  };
}
