import { pool } from '../pool.js';
import type { UserRow } from '../types.js';

export async function getById(id: string): Promise<UserRow | null> {
  // hebrew_name rides along from the whitelist entry (migration 040): it's the
  // admin-entered name agents sign with, kept out of users so it survives the
  // Google profile re-sync on every login.
  const { rows } = await pool.query<UserRow>(
    `SELECT u.*, w.hebrew_name
     FROM users u
     LEFT JOIN whitelisted_emails w ON w.email = lower(u.email)
     WHERE u.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface UserListRow {
  id: string;
  email: string;
  name: string | null;
  hebrew_name: string | null;
  is_admin: boolean;
  created_at: string;
  mailbox_address: string | null;
  whitelisted: boolean;
  /** False for invited rows (admin-created, no Google identity claimed yet). */
  signed_in: boolean;
}

/**
 * All users, newest first — admin panel only. No agent-specific rollups here:
 * per-agent client counts come from agentInstances.listAllWithClientCounts().
 */
export async function listAll(): Promise<UserListRow[]> {
  const { rows } = await pool.query<UserListRow>(
    `SELECT u.id, u.email, u.name, w.hebrew_name, u.is_admin, u.created_at,
            m.email_address AS mailbox_address,
            (w.email IS NOT NULL) AS whitelisted,
            (u.google_sub IS NOT NULL) AS signed_in
     FROM users u
     LEFT JOIN agent_mailboxes m ON m.user_id = u.id
     LEFT JOIN whitelisted_emails w ON w.email = lower(u.email)
     ORDER BY u.created_at DESC`,
  );
  return rows;
}

/**
 * Permanently deletes an account; FK cascades take its agent instances,
 * clients, emails, documents and tokens with it. `NOT is_admin` is a second
 * line of defense under the handler's own guard — an admin row is never
 * deletable here regardless of caller bugs.
 */
export async function deleteById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('DELETE FROM users WHERE id = $1 AND NOT is_admin RETURNING *', [id]);
  return rows[0] ?? null;
}

export async function getByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

export async function countAdmins(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM users WHERE is_admin');
  return Number(rows[0]?.count ?? 0);
}

export interface AdminListRow {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

/** Everyone with admin access, oldest grant first — the admin panel's Admins section. */
export async function listAdmins(): Promise<AdminListRow[]> {
  const { rows } = await pool.query<AdminListRow>(
    'SELECT id, email, name, created_at FROM users WHERE is_admin ORDER BY created_at',
  );
  return rows;
}

/** Alert-recipient addresses (adminAlert.ts). */
export async function listAdminEmails(): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>('SELECT email FROM users WHERE is_admin');
  return rows.map((r) => r.email);
}

export async function isAdminEmailInDb(email: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM users WHERE lower(email) = lower($1) AND is_admin', [email]);
  return rows.length > 0;
}

export async function setAdminByEmail(email: string, isAdmin: boolean): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    'UPDATE users SET is_admin = $2, updated_at = now() WHERE lower(email) = lower($1) RETURNING *',
    [email, isAdmin],
  );
  return rows[0] ?? null;
}

export async function setAdminById(id: string, isAdmin: boolean): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    'UPDATE users SET is_admin = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, isAdmin],
  );
  return rows[0] ?? null;
}

/**
 * One-time bootstrap: while the DB has ZERO admins, promote every existing
 * account whose email is in ADMIN_EMAILS — atomically, so concurrent callers
 * can't double-seed. Once any admin exists this is a no-op forever; from then
 * on admin access is granted and revoked only through the admin panel.
 */
export async function bootstrapAdminsIfNone(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const { rows } = await pool.query<{ email: string }>(
    `UPDATE users SET is_admin = true, updated_at = now()
     WHERE lower(email) = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin)
     RETURNING email`,
    [emails],
  );
  return rows.map((r) => r.email);
}

/**
 * Admin-side account creation (activation/whitelisting): an "invited" row with
 * no Google identity, so agents can be configured before the accountant's
 * first sign-in. Returns null when a user with this email already exists
 * (any casing) — the caller then has nothing to do.
 */
export async function createInvited(email: string, name: string | null): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, name)
     SELECT $1, $2
     WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower($1))
     ON CONFLICT (email) DO NOTHING
     RETURNING *`,
    [email.toLowerCase(), name],
  );
  return rows[0] ?? null;
}

/**
 * First verified Google sign-in of an invited account: fills in the Google
 * identity on the admin-created row so everything configured pre-login (agents,
 * addresses, WhatsApp numbers) is already theirs. Google-login callback only —
 * unverified email claims (e.g. monday-reported emails) must never reach this.
 */
export async function claimInvitedByEmail(args: {
  googleSub: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users
     SET google_sub = $1, email = $2, name = $3, picture_url = $4, updated_at = now()
     WHERE google_sub IS NULL AND lower(email) = lower($2)
     RETURNING *`,
    [args.googleSub, args.email, args.name, args.pictureUrl],
  );
  return rows[0] ?? null;
}

/**
 * Called on every Google sign-in: creates the user on first login, and keeps
 * email/name/picture in sync with the Google profile afterwards. `google_sub`
 * is Google's stable per-account id — email can change, sub never does.
 * (Invited rows never conflict here — their google_sub is NULL.)
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
  // Accounts start with zero agent instances; every agent — the doc collector
  // included — is admin-created (agentInstances.enableInstance).
  return row;
}
