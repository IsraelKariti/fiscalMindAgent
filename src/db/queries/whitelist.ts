import { pool } from '../pool.js';

export interface WhitelistRow {
  email: string;
  name: string | null;
  /** Admin-entered Hebrew name of the accountant/firm — the name agents sign with. */
  hebrew_name: string | null;
  created_at: Date;
}

export interface WhitelistListRow extends WhitelistRow {
  /** Whether the accountant has signed in with Google at least once (invited rows haven't). */
  signed_up: boolean;
}

export async function isWhitelisted(email: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM whitelisted_emails WHERE email = $1', [email.toLowerCase()]);
  return rows.length > 0;
}

export async function listAll(): Promise<WhitelistListRow[]> {
  const { rows } = await pool.query<WhitelistListRow>(
    `SELECT w.email, w.name, w.hebrew_name, w.created_at, (u.google_sub IS NOT NULL) AS signed_up
     FROM whitelisted_emails w
     LEFT JOIN users u ON lower(u.email) = w.email
     ORDER BY w.created_at DESC`,
  );
  return rows;
}

/** Returns null when the email is already whitelisted. */
export async function add(email: string, name: string | null, hebrewName: string | null): Promise<WhitelistRow | null> {
  const { rows } = await pool.query<WhitelistRow>(
    `INSERT INTO whitelisted_emails (email, name, hebrew_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING *`,
    [email.toLowerCase(), name, hebrewName],
  );
  return rows[0] ?? null;
}

/** Returns false when the email is not whitelisted. */
export async function setHebrewName(email: string, hebrewName: string | null): Promise<boolean> {
  const { rowCount } = await pool.query('UPDATE whitelisted_emails SET hebrew_name = $2 WHERE email = $1', [
    email.toLowerCase(),
    hebrewName,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function remove(email: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM whitelisted_emails WHERE email = $1', [email.toLowerCase()]);
  return (rowCount ?? 0) > 0;
}
