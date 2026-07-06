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

export async function insertDraft(
  clientId: string,
  subject: string,
  body: string,
  reasoning: string | null = null,
): Promise<EmailRow> {
  const { rows } = await pool.query<EmailRow>(
    `INSERT INTO emails (client_id, direction, status, subject, body, reasoning)
     VALUES ($1, 'outbound', 'draft', $2, $3, $4) RETURNING *`,
    [clientId, subject, body, reasoning],
  );
  const row = rows[0];
  if (!row) throw new Error('insertDraft: no row returned');
  return row;
}

export async function markSent(
  id: string,
  args: { messageId: string | null; resendId: string; sentAt: Date },
): Promise<void> {
  await pool.query(
    `UPDATE emails SET status = 'sent', message_id = $2, resend_id = $3, sent_at = $4 WHERE id = $1`,
    [id, args.messageId, args.resendId, args.sentAt],
  );
}

/** Returns the inserted row, or null if a row with this message_id already existed (idempotent). */
export async function insertInboundIfNew(
  clientId: string,
  args: { messageId: string; resendId: string; subject: string; body: string; sentAt: Date },
): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>(
    `INSERT INTO emails (client_id, direction, status, message_id, resend_id, subject, body, sent_at)
     VALUES ($1, 'inbound', 'received', $2, $3, $4, $5, $6)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING *`,
    [clientId, args.messageId, args.resendId, args.subject, args.body, args.sentAt],
  );
  return rows[0] ?? null;
}

export async function getByMessageId(messageId: string): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>('SELECT * FROM emails WHERE message_id = $1', [messageId]);
  return rows[0] ?? null;
}

/** Message-IDs of the client's conversation so far, oldest first — feeds In-Reply-To/References on the next send. */
export async function listMessageIdsForClient(clientId: string): Promise<string[]> {
  const { rows } = await pool.query<{ message_id: string }>(
    `SELECT message_id FROM emails
     WHERE client_id = $1 AND status IN ('sent', 'received') AND message_id IS NOT NULL
     ORDER BY COALESCE(sent_at, created_at) ASC`,
    [clientId],
  );
  return rows.map((r) => r.message_id);
}
