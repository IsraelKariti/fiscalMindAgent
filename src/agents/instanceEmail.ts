/**
 * Per-instance sender addresses are assigned only by an admin — at activation
 * (mandatory for types that email clients) or via the agent page's address
 * form. There is deliberately no auto-derivation: an agent must never start
 * emailing clients from an address nobody agreed to.
 */

import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import type { AgentMailboxRow } from '../db/types.js';

/**
 * The mailbox an instance sends (and receives replies) from: its own
 * admin-assigned address, or — for instances enabled before addresses became
 * mandatory at activation — the accountant's legacy account mailbox.
 * Null means the instance cannot email clients yet.
 */
export async function resolveSenderMailbox(
  agentInstanceId: string | null,
  userId: string | null,
): Promise<AgentMailboxRow | null> {
  const instanceMailbox = agentInstanceId ? await agentMailboxes.getByInstanceId(agentInstanceId) : null;
  if (instanceMailbox) return instanceMailbox;
  return userId ? await agentMailboxes.getByUserId(userId) : null;
}

/** RFC 5322 display-name From header; falls back to the bare address when there's no name. */
export function formatFrom(displayName: string | null, address: string): string {
  const name = displayName?.replace(/[\r\n"<>]/g, '').trim();
  return name ? `"${name}" <${address}>` : address;
}
