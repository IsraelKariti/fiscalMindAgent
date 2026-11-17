/**
 * The admin versions page's figures (openspec `cost-per-version`): one entry
 * per app version, newest first, each with its totals, its cost per unit of
 * work (planning cycle, document, planner call) and the change of each
 * per-unit figure against the next older version. Pure: the route loads the
 * (version, purpose) groups (db/queries/versionCost.ts) and calls
 * `summarizeVersions`.
 *
 * Only planner-purpose calls carry a plan_run_id today, so the planner
 * group's distinct-cycle count is the version's cycle count; only
 * extract_document calls are "document extractions". Calls with no version
 * (older than migration 078) fold into one `before` entry, last, which takes
 * part in no comparison.
 */
export interface VersionGroupInput {
  appVersion: string | null;
  purpose: string;
  calls: number;
  failed: number;
  cost: number;
  unpriced: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  cycles: number;
  files: number;
  firstAt: Date;
  lastAt: Date;
}

export const PLANNER_PURPOSE = 'planner';
export const EXTRACTION_PURPOSE = 'extract_document';
/** Below this many calls a version's figures are weak and the card says so. */
export const FEW_CALLS = 10;

export interface StageSummary {
  purpose: string;
  calls: number;
  failed: number;
  cost: number;
  unpriced: number;
  avgCost: number;
  avgInputTokens: number;
  /** Output plus thinking tokens per call. */
  avgOutputTokens: number;
  /** cached / input; null when the stage used no input tokens. */
  cacheShare: number | null;
  /** Change against the same stage of the previous version; null when absent there or on the oldest version. */
  avgCostDelta: number | null;
  avgInputTokensDelta: number | null;
}

export interface VersionSummary {
  /** The short commit, or null for the `before` entry. */
  version: string | null;
  firstAt: Date;
  lastAt: Date;
  /** Days from the first to the last call, counting the first day: 1 for a version whose calls all fall within 24 hours. */
  daysActive: number;
  calls: number;
  failed: number;
  cost: number;
  unpriced: number;
  cycles: number;
  documents: number;
  costPerCycle: number | null;
  costPerDocument: number | null;
  plannerCalls: number;
  plannerInputTokensAvg: number | null;
  /** (this − previous) / previous; null when either side is missing, previous is 0, or there is no previous version. */
  costPerCycleDelta: number | null;
  costPerDocumentDelta: number | null;
  plannerInputTokensDelta: number | null;
  fewCalls: boolean;
  stages: StageSummary[];
}

const DAY = 86_400_000;

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

interface Acc {
  version: string | null;
  firstAt: Date;
  lastAt: Date;
  groups: VersionGroupInput[];
}

function stageOf(g: VersionGroupInput): StageSummary {
  return {
    purpose: g.purpose,
    calls: g.calls,
    failed: g.failed,
    cost: g.cost,
    unpriced: g.unpriced,
    avgCost: g.calls > 0 ? g.cost / g.calls : 0,
    avgInputTokens: g.calls > 0 ? g.inputTokens / g.calls : 0,
    avgOutputTokens: g.calls > 0 ? (g.outputTokens + g.thinkingTokens) / g.calls : 0,
    cacheShare: g.inputTokens > 0 ? g.cachedTokens / g.inputTokens : null,
    avgCostDelta: null,
    avgInputTokensDelta: null,
  };
}

function versionOf(acc: Acc): VersionSummary {
  const sum = (f: (g: VersionGroupInput) => number) => acc.groups.reduce((n, g) => n + f(g), 0);
  const planner = acc.groups.find((g) => g.purpose === PLANNER_PURPOSE) ?? null;
  const extraction = acc.groups.find((g) => g.purpose === EXTRACTION_PURPOSE) ?? null;
  const cycles = planner?.cycles ?? 0;
  const documents = extraction?.files ?? 0;
  const calls = sum((g) => g.calls);
  return {
    version: acc.version,
    firstAt: acc.firstAt,
    lastAt: acc.lastAt,
    daysActive: Math.floor((acc.lastAt.getTime() - acc.firstAt.getTime()) / DAY) + 1,
    calls,
    failed: sum((g) => g.failed),
    cost: sum((g) => g.cost),
    unpriced: sum((g) => g.unpriced),
    cycles,
    documents,
    costPerCycle: planner && cycles > 0 ? planner.cost / cycles : null,
    costPerDocument: extraction && documents > 0 ? extraction.cost / documents : null,
    plannerCalls: planner?.calls ?? 0,
    plannerInputTokensAvg: planner && planner.calls > 0 ? planner.inputTokens / planner.calls : null,
    costPerCycleDelta: null,
    costPerDocumentDelta: null,
    plannerInputTokensDelta: null,
    fewCalls: calls < FEW_CALLS,
    stages: [...acc.groups].sort((a, b) => b.cost - a.cost || a.purpose.localeCompare(b.purpose)).map(stageOf),
  };
}

/**
 * Folds the (version, purpose) groups into versions ordered by first call,
 * newest first, and fills each version's deltas against the next older
 * version in that order. The `before` entry (no version) comes last and is
 * compared with nothing.
 */
export function summarizeVersions(groups: VersionGroupInput[]): VersionSummary[] {
  const byVersion = new Map<string | null, Acc>();
  for (const g of groups) {
    const acc = byVersion.get(g.appVersion);
    if (!acc) {
      byVersion.set(g.appVersion, { version: g.appVersion, firstAt: g.firstAt, lastAt: g.lastAt, groups: [g] });
      continue;
    }
    acc.groups.push(g);
    if (g.firstAt < acc.firstAt) acc.firstAt = g.firstAt;
    if (g.lastAt > acc.lastAt) acc.lastAt = g.lastAt;
  }
  const before = byVersion.get(null) ?? null;
  byVersion.delete(null);
  const versions = [...byVersion.values()]
    .sort((a, b) => b.firstAt.getTime() - a.firstAt.getTime())
    .map(versionOf);
  for (let i = 0; i < versions.length - 1; i += 1) {
    const cur = versions[i]!;
    const prev = versions[i + 1]!;
    cur.costPerCycleDelta = delta(cur.costPerCycle, prev.costPerCycle);
    cur.costPerDocumentDelta = delta(cur.costPerDocument, prev.costPerDocument);
    cur.plannerInputTokensDelta = delta(cur.plannerInputTokensAvg, prev.plannerInputTokensAvg);
    for (const stage of cur.stages) {
      const prevStage = prev.stages.find((s) => s.purpose === stage.purpose);
      if (!prevStage) continue;
      stage.avgCostDelta = delta(stage.avgCost, prevStage.avgCost);
      stage.avgInputTokensDelta = delta(stage.avgInputTokens, prevStage.avgInputTokens);
    }
  }
  if (before) versions.push(versionOf(before));
  return versions;
}
