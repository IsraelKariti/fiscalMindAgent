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

/**
 * Admin review (048) — all transitions are status-guarded so races (double
 * click, concurrent replan, worker retry) resolve to 0 rows instead of
 * corrupting state.
 */
export async function markReviewPending(id: string): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>(
    `UPDATE emails SET review_status = 'pending'
     WHERE id = $1 AND status = 'draft' AND review_status IS NULL RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/** Parks a draft whose send time arrived unapproved. Also promotes drafts scheduled before review mode was switched on ('pending' + the caller's reminder alert). */
export async function markHeld(id: string): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>(
    `UPDATE emails SET status = 'held', held_at = now(), review_status = 'pending'
     WHERE id = $1 AND status = 'draft' RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/** Approves a pending draft (scheduled or parked); flips 'held' back to 'draft' so the worker accepts it. Null = it was no longer pending (superseded / double-approve). */
export async function approvePending(id: string): Promise<EmailRow | null> {
  const { rows } = await pool.query<EmailRow>(
    `UPDATE emails SET review_status = 'approved', status = 'draft'
     WHERE id = $1 AND review_status = 'pending' RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/** A replan made the client's pending drafts obsolete; parked ones rejoin the abandoned-draft lifecycle. */
export async function supersedePendingReview(clientId: string): Promise<void> {
  await pool.query(
    `UPDATE emails SET review_status = 'superseded', status = 'draft'
     WHERE client_id = $1 AND review_status = 'pending'`,
    [clientId],
  );
}

/** Badge count; same scoping as listPendingReview so the badge always matches the list. */
export async function countPendingReview(): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM emails e
     JOIN clients c ON c.id = e.client_id
     JOIN agent_instances i ON i.id = c.agent_instance_id
     WHERE e.review_status = 'pending' AND i.agent_type = 'declaration_of_capital'`,
  );
  return rows[0]?.count ?? 0;
}

export type ReviewQueueRow = EmailRow & {
  client_name: string;
  client_admin_paused: boolean;
  agent_instance_id: string | null;
  agent_type: string | null;
  instance_name: string | null;
  accountant_email: string | null;
  accountant_name: string | null;
  scheduled_for: Date | null;
};

/** The admin review queue: pending drafts with the context the UI shows. The agent_type filter is belt-and-braces — only declaration_of_capital drafts ever get flagged. */
export async function listPendingReview(): Promise<ReviewQueueRow[]> {
  const { rows } = await pool.query<ReviewQueueRow>(
    `SELECT e.*, c.name AS client_name, c.admin_paused AS client_admin_paused,
            i.id AS agent_instance_id, i.agent_type, i.name AS instance_name,
            u.email AS accountant_email, u.name AS accountant_name,
            sj.scheduled_for
     FROM emails e
     JOIN clients c ON c.id = e.client_id
     LEFT JOIN agent_instances i ON i.id = c.agent_instance_id
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN scheduled_jobs sj ON sj.client_id = e.client_id
     WHERE e.review_status = 'pending' AND i.agent_type = 'declaration_of_capital'
     ORDER BY COALESCE(sj.scheduled_for, e.created_at) ASC`,
  );
  return rows;
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
