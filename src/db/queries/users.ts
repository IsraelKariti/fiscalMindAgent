import { pool } from '../pool.js';
import type { UserRow } from '../types.js';
import { ensureInstance } from './agentInstances.js';
import type { AccountTier } from './whitelist.js';

export async function getById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export interface UserListRow {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  mailbox_address: string | null;
  whitelisted: boolean;
  /** Null when the user is not whitelisted (tier lives on the whitelist entry). */
  tier: AccountTier | null;
}

/**
 * All users, newest first — admin panel only. No agent-specific rollups here:
 * per-agent client counts come from agentInstances.listAllWithClientCounts().
 */
export async function listAll(): Promise<UserListRow[]> {
  const { rows } = await pool.query<UserListRow>(
    `SELECT u.id, u.email, u.name, u.created_at,
            m.email_address AS mailbox_address,
            (w.email IS NOT NULL) AS whitelisted,
            w.tier
     FROM users u
     LEFT JOIN agent_mailboxes m ON m.user_id = u.id
     LEFT JOIN whitelisted_emails w ON w.email = lower(u.email)
     ORDER BY u.created_at DESC`,
  );
  return rows;
}

export async function getByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

/**
 * Called on every Google sign-in: creates the user on first login, and keeps
 * email/name/picture in sync with the Google profile afterwards. `google_sub`
 * is Google's stable per-account id — email can change, sub never does.
 */
export async function upsertFromGoogle(args: {
  googleSub: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (google_sub, email, name, picture_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, picture_url = EXCLUDED.picture_url, updated_at = now()
     RETURNING *`,
    [args.googleSub, args.email, args.name, args.pictureUrl],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertFromGoogle: no row returned');
  // Both sign-in paths (Google OAuth, monday auto-provision) come through
  // here, so this is the one place that keeps the 019 backfill invariant:
  // every accountant has a doc_collector instance.
  await ensureInstance(row.id, 'doc_collector');
  return row;
}
