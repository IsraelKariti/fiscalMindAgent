import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import { ensureInstanceEmail } from '../agents/instanceEmail.js';
import { logger } from '../util/logger.js';

// 3–30 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen —
// mirrors the CHECK constraint on agent_mailboxes.local_part.
const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/;

// Names that must never become an agent mailbox: RFC 2142 role addresses,
// deliverability/abuse contacts, and brand/system names.
const RESERVED = new Set([
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

type Unavailable = 'invalid' | 'reserved' | 'taken';

function normalizeName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

async function checkName(name: string): Promise<Unavailable | null> {
  if (!LOCAL_PART_RE.test(name)) return 'invalid';
  if (RESERVED.has(name)) return 'reserved';
  if (await agentMailboxes.getByLocalPart(name)) return 'taken';
  return null;
}

export async function mailboxStatus(req: Request, res: Response): Promise<void> {
  const mailbox = await agentMailboxes.getByUserId(req.userId!);
  res.json({
    claimed: mailbox !== null,
    emailAddress: mailbox?.email_address ?? null,
    localPart: mailbox?.local_part ?? null,
    domain: env.AGENT_EMAIL_DOMAIN,
  });
}

export async function mailboxAvailability(req: Request, res: Response): Promise<void> {
  const name = normalizeName(req.query.name);
  const reason = await checkName(name);
  res.json(reason ? { name, available: false, reason } : { name, available: true });
}

const ClaimSchema = z.object({ name: z.string() }).strict();

export async function claimMailbox(req: Request, res: Response): Promise<void> {
  const parsed = ClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { name: string }.' });
    return;
  }
  const name = normalizeName(parsed.data.name);

  // Names are permanent: clients correspond with the address, and a released
  // name could be re-claimed by someone else and receive the old owner's mail.
  if (await agentMailboxes.getByUserId(req.userId!)) {
    res.status(409).json({ error: 'You already have an agent mailbox — names are permanent.' });
    return;
  }

  const reason = await checkName(name);
  if (reason === 'invalid') {
    res.status(400).json({ error: 'Names are 3–30 characters: lowercase letters, digits and hyphens (not at the edges).' });
    return;
  }
  if (reason === 'reserved') {
    res.status(409).json({ error: 'That name is reserved.' });
    return;
  }
  if (reason === 'taken') {
    res.status(409).json({ error: 'That name is already taken.' });
    return;
  }

  try {
    const mailbox = await agentMailboxes.insertForUser({
      userId: req.userId!,
      localPart: name,
      emailAddress: `${name}@${env.AGENT_EMAIL_DOMAIN}`,
    });
    // Best-effort: derive each enabled agent's sender address now so settings
    // pages show them right away; send time re-ensures on any failure here.
    try {
      for (const instance of await agentInstances.listForUser(req.userId!)) {
        await ensureInstanceEmail(instance);
      }
    } catch (err) {
      logger.warn('failed to provision instance email addresses after claim', {
        userId: req.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    res.status(201).json({ mailbox: { emailAddress: mailbox.email_address, localPart: mailbox.local_part } });
  } catch (err) {
    // 23505 = unique_violation: someone claimed the name (or this user claimed
    // another name) between the checks above and the INSERT.
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That name was just taken.' });
      return;
    }
    throw err;
  }
}
