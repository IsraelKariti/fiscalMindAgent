import { pool } from '../pool.js';
import type { EmailRow, MessageChannel } from '../types.js';

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
  args: {
    channel: MessageChannel;
    /** '' on whatsapp drafts. */
    subject: string;
    body: string;
    reasoning?: string | null;
    /** Twilio Content SID + variables when this is a WhatsApp template message. */
    waContentSid?: string | null;
    waContentVariables?: string[] | null;
  },
): Promise<EmailRow> {
  const { rows } = await pool.query<EmailRow>(
    `INSERT INTO emails (client_id, direction, status, channel, subject, body, reasoning, wa_content_sid, wa_content_variables)
     VALUES ($1, 'outbound', 'draft', $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      clientId,
      args.channel,
      args.subject,
      args.body,
      args.reasoning ?? null,
      args.waContentSid ?? null,
      args.waContentVariables == null ? null : JSON.stringify(args.waContentVariables),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('insertDraft: no row returned');
  return row;
}

export async function markSent(
  id: string,
  args: { messageId: string | null; resendId?: string | null; sentAt: Date },
): Promise<void> {
  await pool.query(
    `UPDATE emails SET status = 'sent', message_id = $2, resend_id = $3, sent_at = $4 WHERE id = $1`,
    [id, args.messageId, args.resendId ?? null, args.sentAt],
  );
}

/** Returns the inserted row, or null if a row with this message_id already existed (idempotent). */
export async function insertInboundIfNew(
  clientId: string,
  args: {
    channel: MessageChannel;
    /** RFC 5322 Message-ID (email) or Twilio MessageSid (whatsapp). */
    messageId: string;
    resendId?: string | null;
    subject: string;
    body: string;
    sentAt: Date;
  },
): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>(
    `INSERT INTO emails (client_id, direction, status, channel, message_id, resend_id, subject, body, sent_at)
     VALUES ($1, 'inbound', 'received', $2, $3, $4, $5, $6, $7)
     ON CONFLICT (client_id, message_id) DO NOTHING
     RETURNING *`,
    [clientId, args.channel, args.messageId, args.resendId ?? null, args.subject, args.body, args.sentAt],
  );
  return rows[0] ?? null;
}

/**
 * Overwrites a stored message body in place. Only used to redact one-time
 * secrets (tax-portal OTPs) after they have been consumed — the code has no
 * reason to live in the DB, and the conversation UI shows the masked body.
 */
export async function overwriteBody(id: string, body: string): Promise<void> {
  await pool.query('UPDATE emails SET body = $2 WHERE id = $1', [id, body]);
}

/** Dedupe is per conversation (019): the same provider message may exist in several clients' threads. */
export async function getByMessageIdForClient(clientId: string, messageId: string): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>('SELECT * FROM emails WHERE client_id = $1 AND message_id = $2', [
    clientId,
    messageId,
  ]);
  return rows[0] ?? null;
}

/**
 * Email Message-IDs of the client's conversation so far, oldest first — feeds
 * In-Reply-To/References on the next send. Email-only: WhatsApp rows store
 * Twilio MessageSids in message_id, which must not leak into email headers.
 */
export async function listMessageIdsForClient(clientId: string): Promise<string[]> {
  const { rows } = await pool.query<{ message_id: string }>(
    `SELECT message_id FROM emails
     WHERE client_id = $1 AND status IN ('sent', 'received') AND channel = 'email' AND message_id IS NOT NULL
     ORDER BY COALESCE(sent_at, created_at) ASC`,
    [clientId],
  );
  return rows.map((r) => r.message_id);
}

/** When the client last wrote on WhatsApp — determines whether the 24h free-form window is open. */
export async function lastInboundWhatsAppAt(clientId: string): Promise<Date | null> {
  const { rows } = await pool.query<{ last_at: Date | null }>(
    `SELECT MAX(COALESCE(sent_at, created_at)) AS last_at FROM emails
     WHERE client_id = $1 AND direction = 'inbound' AND channel = 'whatsapp'`,
    [clientId],
  );
  return rows[0]?.last_at ?? null;
}
