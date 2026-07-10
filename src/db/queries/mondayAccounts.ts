import { pool } from '../pool.js';

export interface MondayAccountRow {
  id: string;
  monday_account_id: string;
  monday_user_id: string;
  user_id: string;
  monday_email: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function getByMondayIds(mondayAccountId: string, mondayUserId: string): Promise<MondayAccountRow | null> {
  const { rows } = await pool.query<MondayAccountRow>(
    'SELECT * FROM monday_accounts WHERE monday_account_id = $1 AND monday_user_id = $2',
    [mondayAccountId, mondayUserId],
  );
  return rows[0] ?? null;
}

/**
 * Points a monday (account, user) pair at a fiscalMind user. Linking an
 * existing account re-points an auto-provisioned mapping, so conflicts update
 * rather than fail (the orphaned auto-provisioned user row is left behind).
 */
export async function upsert(args: {
  mondayAccountId: string;
  mondayUserId: string;
  userId: string;
  mondayEmail: string | null;
}): Promise<MondayAccountRow> {
  const { rows } = await pool.query<MondayAccountRow>(
    `INSERT INTO monday_accounts (monday_account_id, monday_user_id, user_id, monday_email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (monday_account_id, monday_user_id) DO UPDATE
       SET user_id = EXCLUDED.user_id, monday_email = EXCLUDED.monday_email, updated_at = now()
     RETURNING *`,
    [args.mondayAccountId, args.mondayUserId, args.userId, args.mondayEmail],
  );
  const row = rows[0];
  if (!row) throw new Error('upsert monday account: no row returned');
  return row;
}
