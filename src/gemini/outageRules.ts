import { ApiError } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { OpenAiApiError } from './openai.js';
import { LlmBudgetExceededError } from './budget.js';
import { providerForModel, type LlmProvider } from './modelCatalog.js';

/**
 * The pure rules of the provider outage hold (openspec `llm-provider-outage`):
 * which failed call means "the provider is down for a reason on our side"
 * (not "this request is bad", not "the content is dangerous"), how the hold
 * state changes, and when the client gets the one calm acknowledgement. No
 * I/O here — the app_settings, alert and audit side lives in providerOutage.ts.
 */

/** The providers a hold can name; 'budget' is the daily spend cap, refused before any request. */
export type OutageProvider = LlmProvider | 'budget';

/** Why the provider cannot serve us, in the admin's words. */
export type OutageKind = 'billing' | 'auth' | 'quota' | 'rate_limit' | 'server' | 'unreachable' | 'budget';

export interface ProviderHold {
  /** When the hold opened (ISO). */
  since: string;
  kind: OutageKind;
  /** The provider's error text, capped. */
  message: string;
  /** The model whose call opened the hold; the probe re-tries this one. Null for the budget hold. */
  model: string | null;
  /** The last probe: when, and its error when it failed (null after a success is impossible — a success clears the hold). */
  lastProbeAt: string | null;
  lastError: string | null;
}

export type HoldState = Partial<Record<OutageProvider, ProviderHold>>;

const MESSAGE_CAP = 600;

function statusOf(err: unknown): number | null {
  if (err instanceof ApiError || err instanceof OpenAiApiError) return err.status;
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') return err.status;
  return null;
}

function isNetworkError(err: unknown): boolean {
  return (err instanceof TypeError && err.message.includes('fetch failed')) || err instanceof Anthropic.APIConnectionError;
}

/**
 * The outage kind a failed call proves, or null when the failure says nothing
 * about the provider: a timeout (the request may be the problem), a plain
 * 400 (a bad request of ours), a model that answered (refusal, gate) or any
 * ordinary error. Texts are matched case-insensitively on the error message,
 * which for every SDK carries the provider's own wording:
 * - Anthropic 400 "Your credit balance is too low…" → billing
 * - OpenAI 429 "insufficient_quota" / "exceeded your current quota" → billing
 * - Gemini 400 "API key not valid" → auth; 429 RESOURCE_EXHAUSTED "quota" → quota
 */
export function outageKindOf(err: unknown): OutageKind | null {
  // The platform ceiling stops everything; an instance ceiling stops one instance's calls as today.
  if (err instanceof LlmBudgetExceededError) return err.scope === 'platform' ? 'budget' : null;
  if (isNetworkError(err)) return 'unreachable';
  const status = statusOf(err);
  if (status === null) return null;
  const text = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const billing = /credit balance|insufficient_quota|billing|exceeded your current quota|plans & billing|purchase credits/.test(text);
  const quota = /quota|resource_exhausted/.test(text);
  const badKey = /api key|api_key|invalid x-api-key|authentication|unauthorized|permission/.test(text);
  if (status === 400) return billing ? 'billing' : badKey ? 'auth' : null;
  if (status === 401) return 'auth';
  if (status === 402) return 'billing';
  if (status === 403) return billing ? 'billing' : quota ? 'quota' : 'auth';
  if (status === 429) return billing ? 'billing' : quota ? 'quota' : 'rate_limit';
  if (status >= 500 || status === 499) return 'server';
  return null;
}

/** One model that failed inside a call: the primary, and the backup when it was tried. */
export interface CallFailure {
  model: string;
  err: unknown;
}

/**
 * The holds a failed call opens (openspec `llm-provider-outage`): one per
 * provider whose failure proves an outage kind; a provider whose failure
 * proves nothing (timeout, bad request) opens none. The budget stop names
 * the 'budget' pseudo-provider, whatever model was about to be used.
 */
export function holdsAfterFailures(
  failures: readonly CallFailure[],
): { provider: OutageProvider; kind: OutageKind; message: string; model: string | null }[] {
  const out: { provider: OutageProvider; kind: OutageKind; message: string; model: string | null }[] = [];
  for (const { model, err } of failures) {
    const kind = outageKindOf(err);
    if (kind === null) continue;
    const provider: OutageProvider = kind === 'budget' ? 'budget' : providerForModel(model);
    if (out.some((h) => h.provider === provider)) continue;
    const message = err instanceof Error ? err.message : String(err);
    out.push({ provider, kind, message: message.slice(0, MESSAGE_CAP), model: kind === 'budget' ? null : model });
  }
  return out;
}

/** Opens (or keeps) the hold on a provider. `opened` is true only when there was none. */
export function openHoldIn(
  state: HoldState,
  provider: OutageProvider,
  info: { kind: OutageKind; message: string; model: string | null },
  now: Date,
): { state: HoldState; opened: boolean } {
  const existing = state[provider];
  if (existing) {
    // A later failure refreshes the error text (the admin sees the latest) but never the start time.
    return { state: { ...state, [provider]: { ...existing, kind: info.kind, message: info.message.slice(0, MESSAGE_CAP) } }, opened: false };
  }
  const hold: ProviderHold = {
    since: now.toISOString(),
    kind: info.kind,
    message: info.message.slice(0, MESSAGE_CAP),
    model: info.model,
    lastProbeAt: null,
    lastError: null,
  };
  return { state: { ...state, [provider]: hold }, opened: true };
}

/** Clears the hold on a provider. `cleared` is false when there was none. */
export function clearHoldIn(state: HoldState, provider: OutageProvider): { state: HoldState; cleared: boolean } {
  if (!state[provider]) return { state, cleared: false };
  const next = { ...state };
  delete next[provider];
  return { state: next, cleared: true };
}

/** A failed probe: the hold stays, the admin sees when it was last tried and what it said. */
export function noteProbeFailureIn(state: HoldState, provider: OutageProvider, error: string, now: Date): HoldState {
  const existing = state[provider];
  if (!existing) return state;
  return { ...state, [provider]: { ...existing, lastProbeAt: now.toISOString(), lastError: error.slice(0, MESSAGE_CAP) } };
}

/** The stored JSON, tolerant of a missing or broken value (no hold). */
export function parseHoldState(raw: string | null | undefined): HoldState {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const state: HoldState = {};
    for (const [provider, hold] of Object.entries(parsed as Record<string, unknown>)) {
      if (!hold || typeof hold !== 'object') continue;
      const h = hold as Record<string, unknown>;
      if (typeof h.since !== 'string' || typeof h.kind !== 'string') continue;
      state[provider as OutageProvider] = {
        since: h.since,
        kind: h.kind as OutageKind,
        message: typeof h.message === 'string' ? h.message : '',
        model: typeof h.model === 'string' ? h.model : null,
        lastProbeAt: typeof h.lastProbeAt === 'string' ? h.lastProbeAt : null,
        lastError: typeof h.lastError === 'string' ? h.lastError : null,
      };
    }
    return state;
  } catch {
    return {};
  }
}

/** The providers with an open hold. */
export function heldProviders(state: HoldState): OutageProvider[] {
  return (Object.keys(state) as OutageProvider[]).filter((p) => state[p] !== undefined);
}

/**
 * Whether a call may be sent, given the hold state and the providers of the
 * primary and (optional) backup model: 'primary' when nothing stands in the
 * way, 'backup' when only the primary's provider is held and a backup on a
 * free provider exists, 'held' when no model can be reached (or the budget
 * hold is open). A probe bypasses this check entirely (providerOutage.ts).
 */
export function routeUnderHold(
  state: HoldState,
  primaryProvider: LlmProvider,
  backupProvider: LlmProvider | null,
): { route: 'primary' } | { route: 'backup' } | { route: 'held'; provider: OutageProvider; kind: OutageKind } {
  const budget = state.budget;
  if (budget) return { route: 'held', provider: 'budget', kind: budget.kind };
  const primary = state[primaryProvider];
  if (!primary) return { route: 'primary' };
  if (backupProvider !== null && !state[backupProvider]) return { route: 'backup' };
  return { route: 'held', provider: primaryProvider, kind: primary.kind };
}

/**
 * The one calm acknowledgement (openspec `llm-provider-outage`): only once the
 * hold has lasted the configured delay; 0 disables it.
 */
export function holdOldEnoughToAcknowledge(hold: ProviderHold, now: Date, ackAfterSeconds: number): boolean {
  if (ackAfterSeconds <= 0) return false;
  return now.getTime() - new Date(hold.since).getTime() >= ackAfterSeconds * 1000;
}

/** The admin bar's plain Hebrew words for a kind (the UI keeps its own copy for i18n; this one serves the alert email). */
export const OUTAGE_KIND_LABELS_HE: Record<OutageKind, string> = {
  billing: 'בעיית תשלום או יתרה',
  auth: 'מפתח API לא תקין',
  quota: 'חריגה ממכסה',
  rate_limit: 'הגבלת קצב אצל הספק',
  server: 'תקלה אצל הספק',
  unreachable: 'לא ניתן להתחבר לספק',
  budget: 'תקרת ההוצאה היומית',
};

export const OUTAGE_PROVIDER_LABELS: Record<OutageProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  budget: 'תקרת ההוצאה',
};
