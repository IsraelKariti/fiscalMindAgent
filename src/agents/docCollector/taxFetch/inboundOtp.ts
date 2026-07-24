import * as emails from '../../../db/queries/emails.js';
import * as taxFetchSessions from '../../../db/queries/taxFetchSessions.js';
import { enqueueTaxFetch } from '../../../queue/taxFetchQueue.js';
import { logger } from '../../../util/logger.js';
import type { AgentContext, InboundEvent } from '../../types.js';

/** A 4–8 digit run, allowing spaces or hyphens the client may type between digits. */
const OTP_PATTERN = /\b(\d[\d\s-]{2,}\d)\b/;

function extractOtp(body: string): string | null {
  const match = OTP_PATTERN.exec(body);
  if (!match?.[1]) return null;
  const digits = match[1].replace(/[\s-]/g, '');
  return digits.length >= 4 && digits.length <= 8 ? digits : null;
}

/**
 * Intercepts a WhatsApp reply that is the tax-authority OTP, before the normal
 * re-plan. When a fetch is awaiting the code, a message carrying a digit run is
 * routed straight to the worker (OTPs expire in minutes — no LLM round-trip).
 * Returns true when it consumed the message; false to fall through to the LLM
 * (e.g. the client wrote prose, or no fetch is waiting).
 */
export async function maybeHandleOtpInbound(ctx: AgentContext, evt: InboundEvent): Promise<boolean> {
  if (evt.channel !== 'whatsapp' || !evt.isNewMessage || !evt.messageRowId) return false;

  const session = await taxFetchSessions.getActiveForClient(ctx.client.id);
  if (!session || session.status !== 'awaiting_otp') return false;

  const message = await emails.getById(evt.messageRowId);
  if (!message) return false;
  const otp = extractOtp(message.body);
  if (!otp) return false; // let the LLM converse; the prompt explains we're waiting

  await enqueueTaxFetch({ kind: 'submit_otp', sessionId: session.id, otp });

  // The code is single-use and now consumed — don't keep it at rest. Redaction
  // failing must not lose the fetch, so it only logs.
  try {
    await emails.overwriteBody(message.id, message.body.replace(OTP_PATTERN, '••••••'));
  } catch (err) {
    logger.error('tax fetch: failed to redact otp from stored message', err, { messageRowId: message.id });
  }

  logger.info('tax fetch: otp captured from whatsapp reply', { clientId: ctx.client.id, sessionId: session.id });
  return true;
}
