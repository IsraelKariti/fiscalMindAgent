import { pool } from '../pool.js';
import type { AccountantStaffRow } from '../types.js';
import { signedInSql } from './users.js';

export interface StaffListRow extends AccountantStaffRow {
  /** Whether a user with this email has signed in with Google at least once. */
  signed_in: boolean;
}

/** The accountant's staff list, oldest first, with whether each person has signed in yet. */
export async function listForAccountant(accountantUserId: string): Promise<StaffListRow[]> {
  const { rows } = await pool.query<StaffListRow>(
    `SELECT s.*, ${signedInSql('u')} AS signed_in
     FROM accountant_staff s
     LEFT JOIN users u ON lower(u.email) = s.email
     WHERE s.accountant_user_id = $1
     ORDER BY s.created_at ASC`,
    [accountantUserId],
  );
  return rows;
}

/** The staff row for an email (any casing), whichever accountant owns it. */
export async function findByEmail(email: string): Promise<AccountantStaffRow | null> {
  const { rows } = await pool.query<AccountantStaffRow>('SELECT * FROM accountant_staff WHERE email = $1', [
    email.toLowerCase(),
  ]);
  return rows[0] ?? null;
}

/** Returns null when the email is already on some accountant's list. */
export async function add(accountantUserId: string, email: string, createdBy: string): Promise<AccountantStaffRow | null> {
  const { rows } = await pool.query<AccountantStaffRow>(
    `INSERT INTO accountant_staff (accountant_user_id, email, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING *`,
    [accountantUserId, email.toLowerCase(), createdBy],
  );
  return rows[0] ?? null;
}

/** Removes one of the accountant's own rows; null when it is not theirs (or gone). */
export async function removeForAccountant(id: string, accountantUserId: string): Promise<AccountantStaffRow | null> {
  const { rows } = await pool.query<AccountantStaffRow>(
    'DELETE FROM accountant_staff WHERE id = $1 AND accountant_user_id = $2 RETURNING *',
    [id, accountantUserId],
  );
  return rows[0] ?? null;
}
