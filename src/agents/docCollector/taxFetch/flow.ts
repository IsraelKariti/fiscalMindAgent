import * as taxFetchSessions from '../../../db/queries/taxFetchSessions.js';
import { publishClientUpdated } from '../../../events/clientEvents.js';
import { enqueueTaxFetch } from '../../../queue/taxFetchQueue.js';
import { logger } from '../../../util/logger.js';
import type { ClientDocumentRow, ClientRow } from '../../../db/types.js';
import type { TaxFetchSessionRow } from '../../../db/queries/taxFetchSessions.js';
import type { WaChannelState } from '../prompt.js';
import type { TaxFetchAction } from '../decisionSchema.js';
import { listProviderSpecs, type FetchDocumentType, type FetchProviderSpec } from './providers.js';

/** The fetch's state as the prompt/decision layer sees it (collapses the worker's finer statuses). */
export type TaxFetchPromptState =
  | 'none'
  | 'agreed'
  | 'wa_intro_sent'
  | 'awaiting_otp'
  | 'in_progress'
  | 'delivered'
  | 'failed';

/** One fetchable document type's situation for a client (pending vs already collected). */
export interface TaxFetchDocumentTypeState {
  key: string;
  descriptionHe: string;
  /** The pending required-document row this type would satisfy, if any. */
  pendingDocumentId: string | null;
  /** A required document matching this type is already collected. */
  collected: boolean;
}

/** One provider's fetch situation for a client — the unit the prompt and decision layer reason about. */
export interface TaxFetchContext {
  /** Which portal this context is for (providers.ts id). */
  provider: string;
  /** Credentials on file + at least one pending document type + WhatsApp usable — the fetch can be offered/run. */
  available: boolean;
  state: TaxFetchPromptState;
  /** The active (or most-recent relevant) session for this provider, for gating and status text. */
  session: TaxFetchSessionRow | null;
  /** The conversation is live on WhatsApp (client wrote there in the last 24h) — gates start_login. */
  clientOnWhatsapp: boolean;
  /** Per-document-type status for this provider (drives per-document consent). */
  documentTypes: TaxFetchDocumentTypeState[];
}

/** The document-type keys that are currently pending (offerable) for a context. */
export function pendingKeys(ctx: TaxFetchContext): string[] {
  return ctx.documentTypes.filter((t) => t.pendingDocumentId).map((t) => t.key);
}

function promptStateFor(status: TaxFetchSessionRow['status']): TaxFetchPromptState {
  switch (status) {
    case 'agreed':
      return 'agreed';
    case 'wa_intro_sent':
      return 'wa_intro_sent';
    case 'awaiting_otp':
      return 'awaiting_otp';
    case 'logging_in':
    case 'verifying':
    case 'downloading':
      return 'in_progress';
    case 'delivered':
      return 'delivered';
    case 'failed':
      return 'failed';
    default:
      // expired / cancelled — a fresh offer is allowed.
      return 'none';
  }
}

/** Per-type status: the first pending required doc it would satisfy, and whether one is already collected. */
function documentTypeState(type: FetchDocumentType, documents: ClientDocumentRow[]): TaxFetchDocumentTypeState {
  const matching = documents.filter((d) => type.matchesRequiredDocument(d));
  const pending = matching.find((d) => d.status === 'pending') ?? null;
  return {
    key: type.key,
    descriptionHe: type.documentDescriptionHe,
    pendingDocumentId: pending?.id ?? null,
    collected: matching.some((d) => d.status === 'collected'),
  };
}

/** Builds one provider's context: its availability, current session, prompt state, and per-type status. */
async function loadContextForProvider(
  spec: FetchProviderSpec,
  client: ClientRow,
  documents: ClientDocumentRow[],
  waState: WaChannelState,
  clientOnWhatsapp: boolean,
): Promise<TaxFetchContext | null> {
  const documentTypes = spec.documents.map((t) => documentTypeState(t, documents));
  const anyPending = documentTypes.some((t) => t.pendingDocumentId !== null);
  const hasCredentials = (await spec.buildCredentials(client)) !== null;
  const available = hasCredentials && anyPending && waState.allowed;

  const active = await taxFetchSessions.getActiveForClientAndProvider(client.id, spec.id);
  let session = active;
  let state: TaxFetchPromptState = active ? promptStateFor(active.status) : 'none';
  if (!active) {
    const latest = await taxFetchSessions.getLatestForClientAndProvider(client.id, spec.id);
    if (latest && (latest.status === 'delivered' || latest.status === 'failed')) {
      session = latest;
      state = promptStateFor(latest.status);
    }
  }

  // Zero noise for the many clients a provider never applies to: skip it entirely
  // when it's neither available nor has any session worth mentioning.
  if (!available && state === 'none') return null;

  return { provider: spec.id, available, state, session, clientOnWhatsapp, documentTypes };
}

/**
 * Every provider's fetch situation for this client, in registry order. Only
 * providers that are available or have a relevant session are returned, so a
 * client with none gets an empty list (the prompt then omits the whole section).
 */
export async function loadTaxFetchContexts(
  client: ClientRow,
  documents: ClientDocumentRow[],
  waState: WaChannelState,
  /** When the client last wrote on WhatsApp (phone-verified; email is spoof-adjacent) — the readiness signal for start_login. */
  lastInboundAt: Date | null,
): Promise<TaxFetchContext[]> {
  // start_login readiness: the browser login (which fires a real OTP at the
  // client) may only run once the conversation is live on WhatsApp — the client
  // wrote there within the 24h window. WhatsApp is phone-verified; email sender
  // addresses are spoofable, so an email alone must never trigger the login.
  const clientOnWhatsapp = waState.allowed && waState.windowOpen && lastInboundAt !== null;

  const contexts: TaxFetchContext[] = [];
  for (const spec of listProviderSpecs()) {
    const ctx = await loadContextForProvider(spec, client, documents, waState, clientOnWhatsapp);
    if (ctx) contexts.push(ctx);
  }
  return contexts;
}

/** Enqueue the login this long after the heads-up message's send time, so the send has settled. */
const START_LOGIN_SEND_GRACE_MS = 5_000;

/**
 * The document-type keys a fetch will actually cover: the client-agreed set
 * (per-document consent) intersected with what is still pending; falls back to
 * every pending type when the caller passed nothing (e.g. a single-type provider
 * whose LLM omitted the field).
 */
function effectiveKeys(agreedKeys: string[] | null, ctx: TaxFetchContext): string[] {
  const pending = pendingKeys(ctx);
  const chosen = agreedKeys && agreedKeys.length > 0 ? agreedKeys.filter((k) => pending.includes(k)) : pending;
  return chosen.length > 0 ? chosen : pending;
}

/** The checklist doc id to record as the session's primary (first covered pending type). */
function primaryDocumentId(keys: string[], ctx: TaxFetchContext): string | null {
  for (const key of keys) {
    const type = ctx.documentTypes.find((t) => t.key === key);
    if (type?.pendingDocumentId) return type.pendingDocumentId;
  }
  return null;
}

/**
 * Acts on the LLM's tax_fetch_action for one provider after the normal document
 * handling. `agreedKeys` is the per-document consent subset (which of the
 * provider's document types the client agreed to fetch). `message` is the
 * accompanying drafted row + its send delay: start_login is enqueued to run
 * only after the heads-up message goes out — the login triggers the real OTP,
 * which must never reach the client before the message warning about it.
 * Offers are message text only and never touch this function.
 */
export async function applyTaxFetchAction(
  client: ClientRow,
  action: TaxFetchAction | null,
  ctx: TaxFetchContext | null,
  agreedKeys: string[] | null,
  /** The instance's configured tax year (resolveTaxYear) — sites hold documents for multiple years. */
  taxYear: number,
  message: { emailId: string | null; delayMs: number },
): Promise<void> {
  if (!action || !ctx) return;
  const provider = ctx.provider;
  const keys = effectiveKeys(agreedKeys, ctx);

  switch (action) {
    case 'client_agreed': {
      // Offers live in message text only, so consent is usually the machine's
      // first sight of a fetch: create the session directly at wa_intro_sent
      // (the scheduled message is the WhatsApp intro). A pre-login session
      // already in flight just absorbs the (possibly narrowed) document set.
      const active =
        ctx.session && taxFetchSessions.ACTIVE_TAX_FETCH_STATUSES.includes(ctx.session.status) ? ctx.session : null;
      if (active) {
        await taxFetchSessions.setDocumentKeys(active.id, keys);
        if (active.status === 'agreed') await taxFetchSessions.updateStatus(active.id, 'wa_intro_sent');
        logger.info('tax fetch: client agreed, intro scheduled', { clientId: client.id, provider, sessionId: active.id, keys });
      } else {
        if (!ctx.available || keys.length === 0) return;
        const fresh = await taxFetchSessions.insert({
          clientId: client.id,
          provider,
          clientDocumentId: primaryDocumentId(keys, ctx),
          status: 'wa_intro_sent',
          taxYear,
          documentKeys: keys,
        });
        logger.info('tax fetch: client agreed, session created', {
          clientId: client.id,
          provider,
          priorSessionId: ctx.session?.id ?? null,
          sessionId: fresh.id,
          keys,
        });
      }
      publishClientUpdated(client.id);
      return;
    }
    case 'start_login': {
      // The runner only starts a login on a pre-login session (agreed /
      // wa_intro_sent), so bring one into existence whatever the current state:
      // reuse a pre-login one, or — when nothing is in flight (first time, or
      // after failed/expired/cancelled) — create a fresh session directly at
      // wa_intro_sent.
      let sessionId: string;
      const active =
        ctx.session && taxFetchSessions.ACTIVE_TAX_FETCH_STATUSES.includes(ctx.session.status) ? ctx.session : null;
      if (active) {
        await taxFetchSessions.setDocumentKeys(active.id, keys);
        sessionId = active.id;
      } else {
        if (!ctx.available || keys.length === 0) return;
        const fresh = await taxFetchSessions.insert({
          clientId: client.id,
          provider,
          clientDocumentId: primaryDocumentId(keys, ctx),
          status: 'wa_intro_sent',
          taxYear,
          documentKeys: keys,
        });
        sessionId = fresh.id;
        logger.info('tax fetch: fresh session created for start_login', {
          clientId: client.id,
          provider,
          priorSessionId: ctx.session?.id ?? null,
          sessionId,
          keys,
        });
        publishClientUpdated(client.id);
      }
      // Delayed to just after the heads-up message's send time; the runner then
      // verifies that message actually went out before driving the browser.
      await enqueueTaxFetch(
        { kind: 'start_login', sessionId, awaitEmailId: message.emailId ?? undefined },
        { delayMs: message.emailId ? message.delayMs + START_LOGIN_SEND_GRACE_MS : 0 },
      );
      logger.info('tax fetch: start_login enqueued', {
        clientId: client.id,
        provider,
        sessionId,
        awaitEmailId: message.emailId,
        delayMs: message.delayMs,
      });
      return;
    }
    case 'cancel': {
      if (!ctx.session) return;
      await enqueueTaxFetch({ kind: 'cancel', sessionId: ctx.session.id });
      logger.info('tax fetch: cancel enqueued', { clientId: client.id, provider, sessionId: ctx.session.id });
      return;
    }
  }
}
