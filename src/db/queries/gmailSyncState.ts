import { pool } from '../pool.js';
import type { GmailSyncStateRow } from '../types.js';

export async function get(mailboxEmail: string): Promise<GmailSyncStateRow | null> {
  const { rows } = await pool.query<GmailSyncStateRow>('SELECT * FROM gmail_sync_state WHERE mailbox_email = $1', [
    mailboxEmail,
  ]);
  return rows[0] ?? null;
}

export async function seed(mailboxEmail: string, historyId: string, watchExpiration: Date | null): Promise<void> {
  await pool.query(
    `INSERT INTO gmail_sync_state (mailbox_email, last_history_id, watch_expiration)
     VALUES ($1, $2, $3)
     ON CONFLICT (mailbox_email) DO UPDATE SET last_history_id = $2, watch_expiration = $3, updated_at = now()`,
    [mailboxEmail, historyId, watchExpiration],
  );
}

export async function updateHistoryId(mailboxEmail: string, historyId: string): Promise<void> {
  await pool.query(
    'UPDATE gmail_sync_state SET last_history_id = $2, updated_at = now() WHERE mailbox_email = $1',
    [mailboxEmail, historyId],
  );
}
