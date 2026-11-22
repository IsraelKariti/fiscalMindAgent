import * as appSettings from '../db/queries/appSettings.js';
import { raiseAlert } from '../alerts/raiseAlert.js';
import { recordAudit } from '../audit/audit.js';
import { logger } from '../util/logger.js';
import {
  clearHoldIn,
  heldProviders,
  noteProbeFailureIn,
  openHoldIn,
  OUTAGE_KIND_LABELS_HE,
  OUTAGE_PROVIDER_LABELS,
  parseHoldState,
  type HoldState,
  type OutageKind,
  type OutageProvider,
  type ProviderHold,
} from './outageRules.js';

/**
 * The provider outage hold (openspec `llm-provider-outage`): one record per
 * model provider that cannot serve calls for a reason on our side. Stored in
 * app_settings (like the kill switch) so the web and the worker share it
 * without a deploy and it survives restarts. Opened by the call runner
 * (llmCall.ts) after retries and the backup failed, cleared by the probe
 * (outageProbe.ts). Every open and clear is one throttled admin alert and one
 * platform audit row, never one per failed call.
 */
export const OUTAGE_SETTING_KEY = 'llm_outage';
const CACHE_TTL_MS = 10_000;

/** The call was refused before it was sent, or failed, because its provider is held. */
export class ProviderHeldError extends Error {
  constructor(
    readonly provider: OutageProvider,
    readonly kind: OutageKind,
    message: string,
  ) {
    super(`provider held (${provider}, ${kind}): ${message}`);
    this.name = 'ProviderHeldError';
  }
}

export function isProviderHeld(err: unknown): err is ProviderHeldError {
  return err instanceof ProviderHeldError;
}

let cache: { at: number; state: HoldState } | null = null;

async function readState(): Promise<HoldState> {
  const row = await appSettings.get(OUTAGE_SETTING_KEY);
  return parseHoldState(row?.value);
}

async function writeState(state: HoldState): Promise<void> {
  await appSettings.upsert(OUTAGE_SETTING_KEY, JSON.stringify(state));
  cache = { at: Date.now(), state };
}

/** The open holds, cached per process for a few seconds (the runner asks before every call). */
export async function getHolds(): Promise<HoldState> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.state;
  const state = await readState();
  cache = { at: Date.now(), state };
  return state;
}

/** Fresh read, no cache — the admin route and the probe. */
export async function getHoldsFresh(): Promise<HoldState> {
  const state = await readState();
  cache = { at: Date.now(), state };
  return state;
}

export function invalidateHoldCache(): void {
  cache = null;
}

/**
 * Opens the hold on a provider (idempotent: a second failure only refreshes
 * the error text). The first open raises the critical alert, the platform
 * audit row and the warning log. Returns true when this call opened it.
 */
export async function openHold(
  provider: OutageProvider,
  info: { kind: OutageKind; message: string; model: string | null; purpose: string },
): Promise<boolean> {
  const current = await readState();
  const { state, opened } = openHoldIn(current, provider, info, new Date());
  await writeState(state);
  if (!opened) return false;
  logger.warn('provider outage hold opened', { provider, kind: info.kind, model: info.model, purpose: info.purpose, error: info.message.slice(0, 300) });
  recordAudit({
    actorType: 'system',
    action: 'llm.provider_outage',
    severity: 'critical',
    detail: { provider, kind: info.kind, model: info.model, purpose: info.purpose, error: info.message.slice(0, 600) },
  });
  await raiseAlert({
    rule: 'llm.provider_outage',
    scopeKey: provider,
    severity: 'critical',
    title: `${OUTAGE_PROVIDER_LABELS[provider]}: ${OUTAGE_KIND_LABELS_HE[info.kind]} — העבודה ממתינה`,
    detail: { provider, kind: info.kind, model: info.model, purpose: info.purpose, error: info.message.slice(0, 600) },
    throttleMinutes: 60,
  }).catch((err) => logger.error('provider outage alert failed', err, { provider }));
  return true;
}

/**
 * Releases the hold after a successful probe — state only, so the recovery's
 * own calls pass the hold check. reportRecovered follows with the counts.
 */
export async function releaseHold(provider: OutageProvider): Promise<boolean> {
  const current = await readState();
  const { state, cleared } = clearHoldIn(current, provider);
  await writeState(state);
  return cleared;
}

/** The recovered alert and audit row, naming how many clients, messages and files the recovery released. */
export async function reportRecovered(provider: OutageProvider, recovered: { clients: number; messages: number; files: number }): Promise<void> {
  logger.warn('provider outage hold cleared', { provider, ...recovered });
  recordAudit({ actorType: 'system', action: 'llm.provider_recovered', severity: 'info', detail: { provider, ...recovered } });
  await raiseAlert({
    rule: 'llm.provider_recovered',
    scopeKey: provider,
    severity: 'warning',
    title: `${OUTAGE_PROVIDER_LABELS[provider]} חזר לפעול — ${recovered.clients} לקוחות שוחררו`,
    detail: { provider, ...recovered },
    throttleMinutes: 0,
  }).catch((err) => logger.error('provider recovered alert failed', err, { provider }));
}

/** A failed probe keeps the hold and records when and why; no new alert. */
export async function noteProbeFailure(provider: OutageProvider, error: string): Promise<void> {
  const current = await readState();
  await writeState(noteProbeFailureIn(current, provider, error, new Date()));
  logger.warn('provider outage probe failed', { provider, error: error.slice(0, 300) });
}

export function holdOf(state: HoldState, provider: OutageProvider): ProviderHold | null {
  return state[provider] ?? null;
}

export { heldProviders };
export type { HoldState, OutageKind, OutageProvider, ProviderHold };
