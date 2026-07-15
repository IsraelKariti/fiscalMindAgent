import { pool } from '../pool.js';
import type { AgentMailboxRow } from '../types.js';

/** The accountant's claimed account mailbox (per-instance sender rows are excluded). */
export async function getByUserId(userId: string): Promise<AgentMailboxRow | null> {
  const { rows } = await pool.query<AgentMailboxRow>(
    'SELECT * FROM agent_mailboxes WHERE user_id = $1 AND agent_instance_id IS NULL',
    [userId],
  );
  return rows[0] ?? null;
}

export async function getByInstanceId(agentInstanceId: string): Promise<AgentMailboxRow | null> {
  const { rows } = await pool.query<AgentMailboxRow>('SELECT * FROM agent_mailboxes WHERE agent_instance_id = $1', [
    agentInstanceId,
  ]);
  return rows[0] ?? null;
}

/** All of a user's per-instance sender rows (the account mailbox is excluded). */
export async function listForInstancesOfUser(userId: string): Promise<AgentMailboxRow[]> {
  const { rows } = await pool.query<AgentMailboxRow>(
    'SELECT * FROM agent_mailboxes WHERE user_id = $1 AND agent_instance_id IS NOT NULL',
    [userId],
  );
  return rows;
}

/**
 * Re-addresses an instance's sender. The old address stops routing (inbound
 * exact-match finds no row) — callers own warning the admin about that. The
 * UNIQUE constraints are the race-safe arbiter (23505 = "address taken").
 */
export async function updateForInstance(args: {
  agentInstanceId: string;
  localPart: string;
  emailAddress: string;
}): Promise<AgentMailboxRow | null> {
  const { rows } = await pool.query<AgentMailboxRow>(
    'UPDATE agent_mailboxes SET local_part = $2, email_address = $3 WHERE agent_instance_id = $1 RETURNING *',
    [args.agentInstanceId, args.localPart, args.emailAddress],
  );
  return rows[0] ?? null;
}

export async function getByEmailAddress(emailAddress: string): Promise<AgentMailboxRow | null> {
  const { rows } = await pool.query<AgentMailboxRow>('SELECT * FROM agent_mailboxes WHERE email_address = $1', [
    emailAddress.toLowerCase(),
  ]);
  return rows[0] ?? null;
}

/**
 * Allocates a derived per-instance sender address. Plain INSERT: the UNIQUE
 * constraints on local_part/email_address/agent_instance_id are the race-safe
 * arbiter — callers treat 23505 as "address taken, try the next candidate".
 */
export async function insertForInstance(args: {
  userId: string;
  agentInstanceId: string;
  localPart: string;
  emailAddress: string;
}): Promise<AgentMailboxRow> {
  const { rows } = await pool.query<AgentMailboxRow>(
    `INSERT INTO agent_mailboxes (user_id, agent_instance_id, local_part, email_address)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [args.userId, args.agentInstanceId, args.localPart, args.emailAddress],
  );
  const row = rows[0];
  if (!row) throw new Error('insertForInstance: no row returned');
  return row;
}
