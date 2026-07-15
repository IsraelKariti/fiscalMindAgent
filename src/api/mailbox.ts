import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import * as agentMailboxes from '../db/queries/agentMailboxes.js';

// Names that must never become an agent mailbox: RFC 2142 role addresses,
// deliverability/abuse contacts, and brand/system names. Used by the
// admin's per-agent address endpoints (admin.ts).
export const RESERVED = new Set([
  'admin',
  'administrator',
  'abuse',
  'postmaster',
  'hostmaster',
  'webmaster',
  'root',
  'support',
  'help',
  'info',
  'contact',
  'hello',
  'office',
  'sales',
  'billing',
  'security',
  'legal',
  'privacy',
  'noreply',
  'no-reply',
  'mail',
  'mailer-daemon',
  'bounce',
  'bounces',
  'notifications',
  'team',
  'fiscalmind',
  'agent',
  'www',
  'dmarc',
]);

/**
 * The accountant's legacy account mailbox, kept read-only for display and for
 * grandfathered instances that still send from it. New addresses are
 * per-instance and admin-assigned only — there is no accountant-facing claim.
 */
export async function mailboxStatus(req: Request, res: Response): Promise<void> {
  const mailbox = await agentMailboxes.getByUserId(req.userId!);
  res.json({
    claimed: mailbox !== null,
    emailAddress: mailbox?.email_address ?? null,
    localPart: mailbox?.local_part ?? null,
    domain: env.AGENT_EMAIL_DOMAIN,
  });
}
