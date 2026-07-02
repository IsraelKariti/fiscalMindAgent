import { pool } from '../pool.js';
import type { EmailRow } from '../types.js';

/** Chronological history usable for LLM prompt context: sent outbound mail + received inbound mail only. */
export async function listForClient(clientId: string): Promise<EmailRow[]> {
  const { rows } = await pool.query<EmailRow>(
    `SELECT * FROM emails
     WHERE client_id = $1 AND status IN ('sent', 'received')
     ORDER BY COALESCE(sent_at, created_at) ASC`,
    [clientId],
  );
  return rows;
}

export async function getById(id: string): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>('SELECT * FROM emails WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function insertDraft(clientId: string, subject: string, body: string): Promise<EmailRow> {
  const { rows } = await pool.query<EmailRow>(
    `INSERT INTO emails (client_id, direction, status, subject, body)
     VALUES ($1, 'outbound', 'draft', $2, $3) RETURNING *`,
    [clientId, subject, body],
  );
  const row = rows[0];
  if (!row) throw new Error('insertDraft: no row returned');
  return row;
}

export async function markSent(
  id: string,
  args: { gmailMessageId: string; gmailThreadId: string; sentAt: Date },
): Promise<void> {
  await pool.query(
    `UPDATE emails SET status = 'sent', gmail_message_id = $2, gmail_thread_id = $3, sent_at = $4 WHERE id = $1`,
    [id, args.gmailMessageId, args.gmailThreadId, args.sentAt],
  );
}

/** Returns the inserted row, or null if a row with this gmail_message_id already existed (idempotent). */
export async function insertInboundIfNew(
  clientId: string,
  args: { gmailMessageId: string; gmailThreadId: string; subject: string; body: string; sentAt: Date },
): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>(
    `INSERT INTO emails (client_id, direction, status, gmail_message_id, gmail_thread_id, subject, body, sent_at)
     VALUES ($1, 'inbound', 'received', $2, $3, $4, $5, $6)
     ON CONFLICT (gmail_message_id) DO NOTHING
     RETURNING *`,
    [clientId, args.gmailMessageId, args.gmailThreadId, args.subject, args.body, args.sentAt],
  );
  return rows[0] ?? null;
}
