import * as clientPortalCredentials from '../../../db/queries/clientPortalCredentials.js';
import * as emails from '../../../db/queries/emails.js';
import * as taxFetchSessions from '../../../db/queries/taxFetchSessions.js';
import { publishClientUpdated } from '../../../events/clientEvents.js';
import { enqueueTaxFetch } from '../../../queue/taxFetchQueue.js';
import { logger } from '../../../util/logger.js';
import type { ClientDocumentRow, ClientRow } from '../../../db/types.js';
import type { TaxFetchSessionRow } from '../../../db/queries/taxFetchSessions.js';
import type { WaChannelState } from '../prompt.js';
import type { TaxFetchAction } from '../decisionSchema.js';

const PROVIDER_ID = 'israel_tax_authority';

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

export interface TaxFetchContext {
  /** Credentials on file + a pending 106 + WhatsApp usable — the fetch can be offered/run. */
  available: boolean;
  state: TaxFetchPromptState;
  /** The active (or most-recent relevant) session, for gating and status text. */
  session: TaxFetchSessionRow | null;
  /** The pending required-document row a fetched 106 would satisfy. */
  pending106DocId: string | null;
  /** The client has written (any channel) since the session entered agreed/wa_intro_sent — gates start_login. */
  clientRepliedSinceIntro: boolean;
}

export const TAX_FETCH_UNAVAILABLE: TaxFetchContext = {
  available: false,
  state: 'none',
  session: null,
  pending106DocId: null,
  clientRepliedSinceIntro: false,
};

function taxYearFor(now: Date): number {
  // Form 106 for the most recently concluded tax year (the site's default too).
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

/** A pending required document whose name refers to a Form 106 (טופס 106). */
function findPending106(documents: ClientDocumentRow[]): ClientDocumentRow | null {
  return documents.find((d) => d.status === 'pending' && /106/.test(d.name)) ?? null;
}

export async function loadTaxFetchContext(
  client: ClientRow,
  documents: ClientDocumentRow[],
  waState: WaChannelState,
  /** When the client last wrote (any channel) — the readiness signal for start_login. */
  lastInboundAt: Date | null,
): Promise<TaxFetchContext> {
  const creds = await clientPortalCredentials.getForClient(client.id, PROVIDER_ID);
  const pending106 = findPending106(documents);
  const available = Boolean(creds) && pending106 !== null && waState.allowed;

  let active = await taxFetchSessions.getActiveForClient(client.id);
  // An 'offered' session whose offer draft was superseded before sending
  // (regenerate button, client reply triggering a re-plan): the client never
  // saw the offer, so the session must not keep suppressing a fresh one.
  // Pre-027 rows have no offer_email_id and keep the old always-offered read.
  if (active && active.status === 'offered' && active.offer_email_id) {
    const offerMessage = await emails.getById(active.offer_email_id);
    if (!offerMessage || offerMessage.status !== 'sent') {
      await taxFetchSessions.updateStatus(active.id, 'cancelled');
      logger.info('tax fetch: unsent offer draft superseded, session cancelled', {
        clientId: client.id,
        sessionId: active.id,
      });
      active = null;
    }
  }
  let session = active;
  let state: TaxFetchPromptState = active ? promptStateFor(active.status) : 'none';
  if (!active) {
    const latest = await taxFetchSessions.getLatestForClient(client.id);
    if (latest && (latest.status === 'delivered' || latest.status === 'failed')) {
      session = latest;
      state = promptStateFor(latest.status);
    }
  }

  // start_login readiness: the intro asked the client to confirm they're free —
  // only a message of theirs arriving AFTER that transition counts as an answer.
  // (updated_at is stamped when client_agreed moved the session to wa_intro_sent.)
  const clientRepliedSinceIntro =
    active !== null &&
    (active.status === 'agreed' || active.status === 'wa_intro_sent') &&
    lastInboundAt !== null &&
    lastInboundAt.getTime() > active.updated_at.getTime();

  return { available, state, session, pending106DocId: pending106?.id ?? null, clientRepliedSinceIntro };
}

/** Enqueue the login this long after the heads-up message's send time, so the send has settled. */
const START_LOGIN_SEND_GRACE_MS = 5_000;

/**
 * Acts on the LLM's tax_fetch_action after the normal document handling. The
 * accompanying drafted message (offer, WhatsApp intro, "SMS incoming" heads-up)
 * is scheduled by the normal follow-up path; here we only move the fetch's
 * persisted state and enqueue the browser work. `message` is that drafted
 * row + its send delay: an 'offered' session only sticks once the draft is
 * actually sent (see loadTaxFetchContext), and start_login is enqueued to run
 * only after the heads-up message goes out — the login triggers the real OTP
 * SMS, which must never reach the client before the message warning about it.
 */
export async function applyTaxFetchAction(
  client: ClientRow,
  action: TaxFetchAction | null,
  ctx: TaxFetchContext,
  now: Date,
  message: { emailId: string | null; delayMs: number },
): Promise<void> {
  if (!action) return;

  switch (action) {
    case 'offer': {
      if (!ctx.available || !ctx.pending106DocId) return;
      if (ctx.session && ctx.session.status === 'offered') return; // already offered
      await taxFetchSessions.insert({
        clientId: client.id,
        provider: PROVIDER_ID,
        clientDocumentId: ctx.pending106DocId,
        status: 'offered',
        taxYear: taxYearFor(now),
        offerEmailId: message.emailId,
      });
      logger.info('tax fetch: offered', { clientId: client.id });
      publishClientUpdated(client.id);
      return;
    }
    case 'client_agreed': {
      if (!ctx.session) return;
      // The scheduled message is the WhatsApp intro; mark it as sent-intro.
      await taxFetchSessions.updateStatus(ctx.session.id, 'wa_intro_sent');
      logger.info('tax fetch: client agreed, intro scheduled', { clientId: client.id, sessionId: ctx.session.id });
      publishClientUpdated(client.id);
      return;
    }
    case 'start_login': {
      if (!ctx.session) return;
      // Delayed to just after the heads-up message's send time; the runner then
      // verifies that message actually went out before driving the browser.
      await enqueueTaxFetch(
        { kind: 'start_login', sessionId: ctx.session.id, awaitEmailId: message.emailId ?? undefined },
        { delayMs: message.emailId ? message.delayMs + START_LOGIN_SEND_GRACE_MS : 0 },
      );
      logger.info('tax fetch: start_login enqueued', {
        clientId: client.id,
        sessionId: ctx.session.id,
        awaitEmailId: message.emailId,
        delayMs: message.delayMs,
      });
      return;
    }
    case 'cancel': {
      if (!ctx.session) return;
      await enqueueTaxFetch({ kind: 'cancel', sessionId: ctx.session.id });
      logger.info('tax fetch: cancel enqueued', { clientId: client.id, sessionId: ctx.session.id });
      return;
    }
  }
}
