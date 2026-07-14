import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import { env } from '../config/env.js';
import { getAgentType } from './registry.js';
import type { AgentInstanceRow, AgentMailboxRow } from '../db/types.js';

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505';
}

/**
 * The per-instance sender address, provisioned lazily on first need (claim,
 * admin enable, settings read, send). Derived as
 * <account local_part>-<type emailSuffix>@AGENT_EMAIL_DOMAIN; when that exact
 * address is taken (another user's claimed prefix or derived address — one
 * UNIQUE namespace in agent_mailboxes), numbered suffixes keep the agent
 * usable instead of blocking. Returns null when the type doesn't email
 * clients or the accountant hasn't claimed a mailbox yet.
 */
export async function ensureInstanceEmail(instance: AgentInstanceRow): Promise<AgentMailboxRow | null> {
  const suffix = getAgentType(instance.agent_type).emailSuffix;
  if (!suffix) return null;

  const existing = await agentMailboxes.getByInstanceId(instance.id);
  if (existing) return existing;

  const account = await agentMailboxes.getByUserId(instance.user_id);
  if (!account) return null;

  const candidates = [suffix, ...Array.from({ length: 8 }, (_, i) => `${suffix}${i + 2}`)];
  for (const candidate of candidates) {
    const localPart = `${account.local_part}-${candidate}`;
    try {
      return await agentMailboxes.insertForInstance({
        userId: instance.user_id,
        agentInstanceId: instance.id,
        localPart,
        emailAddress: `${localPart}@${env.AGENT_EMAIL_DOMAIN}`,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Either a concurrent ensure won the per-instance unique, or the address
      // itself is taken — return the winner or move to the next candidate.
      const winner = await agentMailboxes.getByInstanceId(instance.id);
      if (winner) return winner;
    }
  }
  throw new Error(`no available derived email address for agent instance ${instance.id}`);
}

/** RFC 5322 display-name From header; falls back to the bare address when there's no name. */
export function formatFrom(displayName: string | null, address: string): string {
  const name = displayName?.replace(/[\r\n"<>]/g, '').trim();
  return name ? `"${name}" <${address}>` : address;
}
