import { pool } from '../pool.js';
import type { AgentMailboxRow } from '../types.js';

export async function getByUserId(userId: string): Promise<AgentMailboxRow | null> {
  const { rows } = await pool.query<AgentMailboxRow>('SELECT * FROM agent_mailboxes WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

export async function getByEmailAddress(emailAddress: string): Promise<AgentMailboxRow | null> {
  const { rows } = await pool.query<AgentMailboxRow>('SELECT * FROM agent_mailboxes WHERE email_address = $1', [
    emailAddress.toLowerCase(),
  ]);
  return rows[0] ?? null;
}

export async function getByLocalPart(localPart: string): Promise<AgentMailboxRow | null> {
  const { rows } = await pool.query<AgentMailboxRow>('SELECT * FROM agent_mailboxes WHERE local_part = $1', [
    localPart.toLowerCase(),
  ]);
  return rows[0] ?? null;
}

/**
 * Claims a mailbox. Plain INSERT: the UNIQUE constraints on local_part and
 * user_id are the race-safe arbiter — callers treat a Postgres 23505
 * (unique_violation) as "name just taken / already claimed".
 */
export async function insertForUser(args: {
  userId: string;
  localPart: string;
  emailAddress: string;
}): Promise<AgentMailboxRow> {
  const { rows } = await pool.query<AgentMailboxRow>(
    `INSERT INTO agent_mailboxes (user_id, local_part, email_address) VALUES ($1, $2, $3) RETURNING *`,
    [args.userId, args.localPart, args.emailAddress],
  );
  const row = rows[0];
  if (!row) throw new Error('insertForUser: no row returned');
  return row;
}
