import * as emails from '../../../db/queries/emails.js';
import * as taxFetchSessions from '../../../db/queries/taxFetchSessions.js';
import { publishClientUpdated } from '../../../events/clientEvents.js';
import { enqueueTaxFetch } from '../../../queue/taxFetchQueue.js';
import { logger } from '../../../util/logger.js';
import type { ClientDocumentRow, ClientRow } from '../../../db/types.js';
import type { TaxFetchSessionRow } from '../../../db/queries/taxFetchSessions.js';
import type { WaChannelState } from '../prompt.js';
import type { TaxFetchAction } from '../decisionSchema.js';
import { listProviderSpecs, type FetchProviderSpec } from './providers.js';

/** The fetch's state as the prompt/decision layer sees it (collapses the worker's finer statuses). */
export type TaxFetchPromptState =
  | 'none'
  | 'offered'
  | 'agreed'
  | 'wa_intro_sent'
  | 'awaiting_otp'
  | 'in_progress'
  | 'delivered'
  | 'failed';

/** One provider's fetch situation for a client — the unit the prompt and decision layer reason about. */
export interface TaxFetchContext {
  /** Which portal this context is for (providers.ts id). */
  provider: string;
  /** Credentials on file + a pending matching document + WhatsApp usable — the fetch can be offered/run. */
  available: boolean;
  state: TaxFetchPromptState;
  /** The active (or most-recent relevant) session for this provider, for gating and status text. */
  session: TaxFetchSessionRow | null;
  /** The pending required-document row this provider's fetch would satisfy. */
  pendingDocumentId: string | null;
  /** The conversation is live on WhatsApp (client wrote there in the last 24h) — gates start_login. */
  clientOnWhatsapp: boolean;
}

function taxYearFor(now: Date): number {
  // The most recently concluded year (Form 106 default; the previous calendar
  // year for the pension report too).
  return now.getFullYear() - 1;
}

function promptStateFor(status: TaxFetchSessionRow['status']): TaxFetchPromptState {
  switch (status) {
    case 'offered':
      return 'offered';
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

/** The first pending required document this provider's fetch would satisfy. */
function findPendingDocument(spec: FetchProviderSpec, documents: ClientDocumentRow[]): ClientDocumentRow | null {
  return documents.find((d) => d.status === 'pending' && spec.matchesRequiredDocument(d)) ?? null;
}

/** Builds one provider's context: its availability, current session and prompt state. */
async function loadContextForProvider(
  spec: FetchProviderSpec,
  client: ClientRow,
  documents: ClientDocumentRow[],
  waState: WaChannelState,
  clientOnWhatsapp: boolean,
): Promise<TaxFetchContext | null> {
  const pending = findPendingDocument(spec, documents);
  const hasCredentials = (await spec.buildCredentials(client)) !== null;
  const available = hasCredentials && pending !== null && waState.allowed;

  let active = await taxFetchSessions.getActiveForClientAndProvider(client.id, spec.id);
  // An 'offered' session whose offer draft was superseded before sending (the
  // client never saw the offer) must not keep suppressing a fresh one. Pre-027
  // rows have no offer_email_id and keep the old always-offered read.
  if (active && active.status === 'offered' && active.offer_email_id) {
    const offerMessage = await emails.getById(active.offer_email_id);
    if (!offerMessage || offerMessage.status !== 'sent') {
      await taxFetchSessions.updateStatus(active.id, 'cancelled');
      logger.info('tax fetch: unsent offer draft superseded, session cancelled', {
        clientId: client.id,
        provider: spec.id,
        sessionId: active.id,
      });
      active = null;
    }
  }

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

  return { provider: spec.id, available, state, session, pendingDocumentId: pending?.id ?? null, clientOnWhatsapp };
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
 * Acts on the LLM's tax_fetch_action for one provider after the normal document
 * handling. `message` is the accompanying drafted row + its send delay: an
 * 'offered' session only sticks once that draft is actually sent (see
 * loadContextForProvider), and start_login is enqueued to run only after the
 * heads-up message goes out — the login triggers the real OTP, which must never
 * reach the client before the message warning about it.
 */
export async function applyTaxFetchAction(
  client: ClientRow,
  action: TaxFetchAction | null,
  ctx: TaxFetchContext | null,
  now: Date,
  message: { emailId: string | null; delayMs: number },
): Promise<void> {
  if (!action || !ctx) return;
  const provider = ctx.provider;

  switch (action) {
    case 'offer': {
      if (!ctx.available || !ctx.pendingDocumentId) return;
      // A session already in flight: nothing to record (and a second insert would
      // trip the one-active-per-provider unique index).
      if (ctx.session && taxFetchSessions.ACTIVE_TAX_FETCH_STATUSES.includes(ctx.session.status)) return;
      await taxFetchSessions.insert({
        clientId: client.id,
        provider,
        clientDocumentId: ctx.pendingDocumentId,
        status: 'offered',
        taxYear: taxYearFor(now),
        offerEmailId: message.emailId,
      });
      logger.info('tax fetch: offered', { clientId: client.id, provider });
      publishClientUpdated(client.id);
      return;
    }
    case 'client_agreed': {
      if (!ctx.session) return;
      // The scheduled message is the WhatsApp intro; mark it as sent-intro.
      await taxFetchSessions.updateStatus(ctx.session.id, 'wa_intro_sent');
      logger.info('tax fetch: client agreed, intro scheduled', { clientId: client.id, provider, sessionId: ctx.session.id });
      publishClientUpdated(client.id);
      return;
    }
    case 'start_login': {
      // The runner only starts a login on a pre-login session (agreed /
      // wa_intro_sent), so bring one into existence whatever the current state:
      // promote a still-'offered' session, reuse a pre-login one, or — when
      // nothing is in flight (first time, or after failed/expired/cancelled) —
      // create a fresh session directly at wa_intro_sent.
      let sessionId: string;
      const active =
        ctx.session && taxFetchSessions.ACTIVE_TAX_FETCH_STATUSES.includes(ctx.session.status) ? ctx.session : null;
      if (active) {
        if (active.status === 'offered') await taxFetchSessions.updateStatus(active.id, 'wa_intro_sent');
        sessionId = active.id;
      } else {
        if (!ctx.available || !ctx.pendingDocumentId) return;
        const fresh = await taxFetchSessions.insert({
          clientId: client.id,
          provider,
          clientDocumentId: ctx.pendingDocumentId,
          status: 'wa_intro_sent',
          taxYear: taxYearFor(now),
        });
        sessionId = fresh.id;
        logger.info('tax fetch: fresh session created for start_login', {
          clientId: client.id,
          provider,
          priorSessionId: ctx.session?.id ?? null,
          sessionId,
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
