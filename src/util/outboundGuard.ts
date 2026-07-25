import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Sandbox fence: with OUTBOUND_ALLOWLIST set, only listed recipients may be
 * messaged. The send choke points (resend/send.ts, twilio/send.ts) call this
 * before hitting the provider; a blocked send is logged and replaced by a
 * fake provider id (see blockedId) so the calling flow proceeds as if it was
 * delivered — full pipelines stay testable against synthetic clients without
 * any risk of reaching a real person. Unset list (prod/dev) = no restriction.
 *
 * Emails match case-insensitively; phone numbers match on digits only, so
 * "+972 50-123-4567" on the list covers "972501234567" and vice versa.
 */
export function outboundBlocked(channel: 'email' | 'whatsapp', recipient: string): boolean {
  if (env.OUTBOUND_ALLOWLIST.length === 0) return false;
  const allowed = env.OUTBOUND_ALLOWLIST.some((entry) => matches(entry, recipient));
  if (!allowed) logger.warn('outbound message blocked by OUTBOUND_ALLOWLIST', { channel, recipient });
  return !allowed;
}

function matches(entry: string, recipient: string): boolean {
  if (recipient.includes('@')) return entry.toLowerCase() === recipient.trim().toLowerCase();
  const entryDigits = entry.replace(/\D/g, '');
  return entryDigits !== '' && entryDigits === recipient.replace(/\D/g, '');
}

/** Stands in for the provider's message id when a send was blocked. */
export function blockedId(): string {
  return `blocked-${randomUUID()}`;
}
