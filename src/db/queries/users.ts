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
  /** False until a Google sign-in: invited rows and monday-provisioned rows haven't (signedInSql). */
  signed_in: boolean;
  /** The accountant whose staff list carries this email (openspec `accountant-employee-access`); null otherwise. */
  staff_of_email: string | null;
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
            ${signedInSql('u')} AS signed_in,
            a.email AS staff_of_email
     FROM users u
     -- One mailbox per agent instance (migration 024): take the oldest so a
     -- user with several agents is still one row.
     LEFT JOIN LATERAL (
       SELECT email_address FROM agent_mailboxes WHERE user_id = u.id ORDER BY created_at LIMIT 1
     ) m ON TRUE
     LEFT JOIN whitelisted_emails w ON w.email = lower(u.email)
     -- A staff viewer's accountant (migration 068), so the admin list can label
     -- them instead of showing "waiting for activation".
     LEFT JOIN accountant_staff s ON s.email = lower(u.email)
     LEFT JOIN users a ON a.id = s.accountant_user_id
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

/** Prefix of the placeholder google_sub written by monday auto-provisioning (monday.ts). */
export const MONDAY_SUB_PREFIX = 'monday:';

/**
 * SQL for "this user has signed in with Google at least once" (openspec
 * `google-sign-in`). An invited row (google_sub NULL) and a monday-provisioned
 * row (placeholder `monday:` sub) both count as not signed in yet.
 */
export function signedInSql(alias: string): string {
  return `(${alias}.google_sub IS NOT NULL AND ${alias}.google_sub NOT LIKE '${MONDAY_SUB_PREFIX}%')`;
}

/** Whether a user with this email (any casing) has signed in with Google. */
export async function hasSignedIn(email: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM users u WHERE lower(u.email) = lower($1) AND ${signedInSql('u')}`, [
    email,
  ]);
  return rows.length > 0;
}

export interface GoogleProfile {
  googleSub: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}

/**
 * Every verified Google sign-in (openspec `google-sign-in`): the email is the
 * identity. The row with this email (any casing) is signed in and refreshed
 * from the Google profile — whether it was created by an earlier sign-in, by
 * an admin invite (google_sub NULL) or by monday (placeholder sub) — so
 * everything attached to it (agents, mailbox, staff membership, monday link)
 * stays the person's. Without such a row a new user is created. google_sub is
 * stored as information only and never used to find a user; the INSERT's
 * conflict clause only covers two first sign-ins racing on the same email.
 */
export async function signInByEmail(args: GoogleProfile): Promise<UserRow> {
  const params = [args.googleSub, args.email, args.name, args.pictureUrl];
  const updated = await pool.query<UserRow>(
    `UPDATE users
     SET google_sub = $1, email = $2, name = $3, picture_url = $4, updated_at = now()
     WHERE lower(email) = lower($2)
     RETURNING *`,
    params,
  );
  if (updated.rows[0]) return updated.rows[0];
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (google_sub, email, name, picture_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET google_sub = EXCLUDED.google_sub, name = EXCLUDED.name, picture_url = EXCLUDED.picture_url, updated_at = now()
     RETURNING *`,
    params,
  );
  const row = rows[0];
  if (!row) throw new Error('signInByEmail: no row returned');
  // Accounts start with zero agent instances; every agent is admin-created
  // (agentInstances.enableInstance).
  return row;
}

/**
 * monday auto-provisioning (monday.ts): a plain insert carrying the placeholder
 * `monday:` sub. The caller checks the email first and maps a unique violation
 * (23505) on users.email to its "email in use" answer; the person's first
 * Google sign-in later takes this row over (signInByEmail).
 */
export async function createFromMonday(args: { email: string; name: string | null; placeholderSub: string }): Promise<UserRow> {
  if (!args.placeholderSub.startsWith(MONDAY_SUB_PREFIX)) throw new Error('createFromMonday: not a monday placeholder sub');
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (google_sub, email, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [args.placeholderSub, args.email, args.name],
  );
  const row = rows[0];
  if (!row) throw new Error('createFromMonday: no row returned');
  return row;
}
