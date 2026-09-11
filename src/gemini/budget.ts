import * as appSettings from '../db/queries/appSettings.js';
import * as llmCalls from '../db/queries/llmCalls.js';
import { recordAudit } from '../audit/audit.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

/**
 * The LLM spend cap — a budget kill switch, distinct from the platform kill
 * switch (which an admin flips by hand): two daily ceilings in USD, platform
 * wide and per agent instance, judged against today's priced llm_calls rows
 * (cost at call time, so an unpriced model counts as 0). When a ceiling is
 * reached every further call is refused before it is sent, audited as
 * llm.budget_exceeded (critical → admin alert). 0 or unset = no ceiling.
 *
 * Cached per process for a minute so the check costs one small query per
 * minute, not one per call. A check that fails (DB hiccup) never blocks a
 * call: the cap is a safety net, not a gate the pipeline depends on.
 */

export const PLATFORM_BUDGET_SETTING_KEY = 'llm_budget_daily_usd';
export const INSTANCE_BUDGET_SETTING_KEY = 'llm_budget_daily_instance_usd';

const CACHE_TTL_MS = 60_000;

export interface LlmBudgetState {
  /** USD per day for every call on the platform; 0 = unlimited. */
  platformDailyUsd: number;
  /** USD per day per agent instance; 0 = unlimited. */
  instanceDailyUsd: number;
  /** Priced spend since today's start (ACCOUNTANT_TIMEZONE) across the platform. */
  spentTodayUsd: number;
}

export class LlmBudgetExceededError extends Error {
  constructor(
    readonly scope: 'platform' | 'instance',
    readonly spentUsd: number,
    readonly budgetUsd: number,
  ) {
    super(`LLM budget exhausted (${scope}): $${spentUsd.toFixed(4)} spent today >= $${budgetUsd.toFixed(2)} ceiling`);
    this.name = 'LlmBudgetExceededError';
  }
}

/** Today's start on the accountants' wall clock, as a UTC instant. */
function startOfToday(now = new Date()): Date {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: env.ACCOUNTANT_TIMEZONE }).format(now);
  // Find the UTC instant at which `day` starts in the zone: take midnight UTC of
  // that day and shift by the zone's offset at that moment.
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: env.ACCOUNTANT_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(utcMidnight);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const localAtUtcMidnight = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  const offsetMs = localAtUtcMidnight - utcMidnight.getTime();
  return new Date(utcMidnight.getTime() - offsetMs);
}

function parseUsd(value: string | null | undefined): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function getBudgetSettings(): Promise<{ platformDailyUsd: number; instanceDailyUsd: number }> {
  const [platform, instance] = await Promise.all([
    appSettings.get(PLATFORM_BUDGET_SETTING_KEY),
    appSettings.get(INSTANCE_BUDGET_SETTING_KEY),
  ]);
  return { platformDailyUsd: parseUsd(platform?.value), instanceDailyUsd: parseUsd(instance?.value) };
}

export async function saveBudgetSettings(next: { platformDailyUsd: number; instanceDailyUsd: number }): Promise<void> {
  await appSettings.upsert(PLATFORM_BUDGET_SETTING_KEY, String(next.platformDailyUsd));
  await appSettings.upsert(INSTANCE_BUDGET_SETTING_KEY, String(next.instanceDailyUsd));
  cache = null;
}

export async function getBudgetState(): Promise<LlmBudgetState> {
  const settings = await getBudgetSettings();
  const spentTodayUsd = await llmCalls.spentSince(startOfToday());
  return { ...settings, spentTodayUsd };
}

interface Cached {
  at: number;
  platformDailyUsd: number;
  instanceDailyUsd: number;
  platformSpent: number;
  instanceSpent: Map<string, number>;
}
let cache: Cached | null = null;

async function loadCache(agentInstanceId: string | null): Promise<Cached> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS && (agentInstanceId === null || cache.instanceSpent.has(agentInstanceId))) {
    return cache;
  }
  const settings = cache && now - cache.at < CACHE_TTL_MS ? cache : await getBudgetSettings();
  const since = startOfToday();
  const platformSpent =
    settings.platformDailyUsd > 0 && !(cache && now - cache.at < CACHE_TTL_MS) ? await llmCalls.spentSince(since) : (cache?.platformSpent ?? 0);
  const instanceSpent = cache && now - cache.at < CACHE_TTL_MS ? cache.instanceSpent : new Map<string, number>();
  if (agentInstanceId !== null && settings.instanceDailyUsd > 0 && !instanceSpent.has(agentInstanceId)) {
    instanceSpent.set(agentInstanceId, await llmCalls.spentSince(since, agentInstanceId));
  }
  cache = {
    at: cache && now - cache.at < CACHE_TTL_MS ? cache.at : now,
    platformDailyUsd: settings.platformDailyUsd,
    instanceDailyUsd: settings.instanceDailyUsd,
    platformSpent,
    instanceSpent,
  };
  return cache;
}

/** Adds a just-finished call's cost to the cached counters so the cap bites within the minute, not after it. */
export function noteSpend(agentInstanceId: string | null, costUsd: number | null): void {
  if (!cache || !costUsd) return;
  cache.platformSpent += costUsd;
  if (agentInstanceId !== null && cache.instanceSpent.has(agentInstanceId)) {
    cache.instanceSpent.set(agentInstanceId, (cache.instanceSpent.get(agentInstanceId) ?? 0) + costUsd);
  }
}

/**
 * Throws LlmBudgetExceededError (after auditing it) when today's spend has
 * reached a ceiling. Never throws for any other reason.
 */
export async function assertWithinBudget(ctx: { purpose: string; agentInstanceId: string | null; clientId: string | null }): Promise<void> {
  let c: Cached;
  try {
    c = await loadCache(ctx.agentInstanceId);
  } catch (err) {
    logger.error('llm budget check failed — allowing the call', err, { purpose: ctx.purpose });
    return;
  }
  const exceeded: { scope: 'platform' | 'instance'; spent: number; budget: number } | null =
    c.platformDailyUsd > 0 && c.platformSpent >= c.platformDailyUsd
      ? { scope: 'platform', spent: c.platformSpent, budget: c.platformDailyUsd }
      : ctx.agentInstanceId !== null && c.instanceDailyUsd > 0 && (c.instanceSpent.get(ctx.agentInstanceId) ?? 0) >= c.instanceDailyUsd
        ? { scope: 'instance', spent: c.instanceSpent.get(ctx.agentInstanceId) ?? 0, budget: c.instanceDailyUsd }
        : null;
  if (!exceeded) return;
  recordAudit({
    actorType: 'system',
    action: 'llm.budget_exceeded',
    agentInstanceId: ctx.agentInstanceId,
    clientId: ctx.clientId,
    severity: 'critical',
    detail: { purpose: ctx.purpose, scope: exceeded.scope, spentUsd: exceeded.spent, budgetUsd: exceeded.budget },
  });
  throw new LlmBudgetExceededError(exceeded.scope, exceeded.spent, exceeded.budget);
}

/** Test/harness hook. */
export function resetBudgetCache(): void {
  cache = null;
}
