import { pool } from '../pool.js';
import type { GmailAccountRow } from '../types.js';

export async function getByUserId(userId: string): Promise<GmailAccountRow | null> {
  const { rows } = await pool.query<GmailAccountRow>('SELECT * FROM gmail_accounts WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

export async function getByEmailAddress(emailAddress: string): Promise<GmailAccountRow | null> {
  const { rows } = await pool.query<GmailAccountRow>('SELECT * FROM gmail_accounts WHERE email_address = $1', [
    emailAddress,
  ]);
  return rows[0] ?? null;
}

/** All connected mailboxes — the watch-renewal job iterates over these. */
export async function listAll(): Promise<GmailAccountRow[]> {
  const { rows } = await pool.query<GmailAccountRow>('SELECT * FROM gmail_accounts ORDER BY created_at');
  return rows;
}

/**
 * Connects (or re-connects) the one mailbox a user's agent acts as. Keyed on
 * user_id (UNIQUE): re-consenting with the same or a different Google account
 * replaces the stored mailbox + token rather than adding a second one.
 */
export async function upsertForUser(args: {
  userId: string;
  emailAddress: string;
  refreshTokenEnc: string;
}): Promise<GmailAccountRow> {
  const { rows } = await pool.query<GmailAccountRow>(
    `INSERT INTO gmail_accounts (user_id, email_address, refresh_token_enc)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET email_address = EXCLUDED.email_address, refresh_token_enc = EXCLUDED.refresh_token_enc, updated_at = now()
     RETURNING *`,
    [args.userId, args.emailAddress, args.refreshTokenEnc],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertForUser: no row returned');
  return row;
}

export async function removeForUser(userId: string): Promise<void> {
  await pool.query('DELETE FROM gmail_accounts WHERE user_id = $1', [userId]);
}
