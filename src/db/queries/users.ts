import { pool } from '../pool.js';
import type { UserRow } from '../types.js';

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
  client_count: number;
  clients_complete: number;
  docs_total: number;
  docs_collected: number;
}

/**
 * All users with their collection-progress rollups, newest first — admin panel only.
 * Each document row joins through exactly one client, so COUNT(d.id) is exact while
 * client counts need DISTINCT to undo the per-document fan-out.
 */
export async function listAll(): Promise<UserListRow[]> {
  const { rows } = await pool.query<UserListRow>(
    `SELECT u.id, u.email, u.name, u.created_at,
            m.email_address AS mailbox_address,
            (w.email IS NOT NULL) AS whitelisted,
            COUNT(DISTINCT c.id)::int AS client_count,
            COUNT(DISTINCT c.id) FILTER (WHERE c.goal_status = 'complete')::int AS clients_complete,
            COUNT(d.id)::int AS docs_total,
            COUNT(d.id) FILTER (WHERE d.status = 'collected')::int AS docs_collected
     FROM users u
     LEFT JOIN agent_mailboxes m ON m.user_id = u.id
     LEFT JOIN whitelisted_emails w ON w.email = lower(u.email)
     LEFT JOIN clients c ON c.user_id = u.id
     LEFT JOIN client_documents d ON d.client_id = c.id
     GROUP BY u.id, m.email_address, w.email
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
  return row;
}
