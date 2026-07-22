import { pool } from '../pool.js';

export type TaxFetchStatus =
  | 'offered'
  | 'agreed'
  | 'wa_intro_sent'
  | 'logging_in'
  | 'awaiting_otp'
  | 'verifying'
  | 'downloading'
  | 'delivered'
  | 'failed'
  | 'expired'
  | 'cancelled';

/** Statuses of a fetch that is still in flight (the partial unique index allows one per client). */
export const ACTIVE_TAX_FETCH_STATUSES: TaxFetchStatus[] = [
  'offered',
  'agreed',
  'wa_intro_sent',
  'logging_in',
  'awaiting_otp',
  'verifying',
  'downloading',
];

/** Statuses whose live browser page exists only in worker memory (orphaned by a restart). */
export const LIVE_BROWSER_STATUSES: TaxFetchStatus[] = ['logging_in', 'awaiting_otp', 'verifying', 'downloading'];

export interface TaxFetchSessionRow {
  id: string;
  client_id: string;
  provider: string;
  client_document_id: string | null;
  status: TaxFetchStatus;
  tax_year: number;
  otp_attempts: number;
  error: string | null;
  document_file_id: string | null;
  otp_requested_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function getById(id: string): Promise<TaxFetchSessionRow | null> {
  const { rows } = await pool.query<TaxFetchSessionRow>('SELECT * FROM tax_fetch_sessions WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getActiveForClient(clientId: string): Promise<TaxFetchSessionRow | null> {
  const { rows } = await pool.query<TaxFetchSessionRow>(
    'SELECT * FROM tax_fetch_sessions WHERE client_id = $1 AND status = ANY($2) ORDER BY created_at DESC LIMIT 1',
    [clientId, ACTIVE_TAX_FETCH_STATUSES],
  );
  return rows[0] ?? null;
}

/** The most recent session regardless of status — lets the prompt mention a delivered/failed fetch. */
export async function getLatestForClient(clientId: string): Promise<TaxFetchSessionRow | null> {
  const { rows } = await pool.query<TaxFetchSessionRow>(
    'SELECT * FROM tax_fetch_sessions WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1',
    [clientId],
  );
  return rows[0] ?? null;
}

export async function insert(args: {
  clientId: string;
  provider: string;
  clientDocumentId: string | null;
  status: TaxFetchStatus;
  taxYear: number;
}): Promise<TaxFetchSessionRow> {
  const { rows } = await pool.query<TaxFetchSessionRow>(
    `INSERT INTO tax_fetch_sessions (client_id, provider, client_document_id, status, tax_year)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [args.clientId, args.provider, args.clientDocumentId, args.status, args.taxYear],
  );
  return rows[0]!;
}

export async function updateStatus(
  id: string,
  status: TaxFetchStatus,
  patch: { error?: string | null; documentFileId?: string; otpRequestedAt?: Date; deliveredAt?: Date } = {},
): Promise<void> {
  await pool.query(
    `UPDATE tax_fetch_sessions
     SET status = $2,
         error = COALESCE($3, error),
         document_file_id = COALESCE($4, document_file_id),
         otp_requested_at = COALESCE($5, otp_requested_at),
         delivered_at = COALESCE($6, delivered_at),
         updated_at = now()
     WHERE id = $1`,
    [id, status, patch.error ?? null, patch.documentFileId ?? null, patch.otpRequestedAt ?? null, patch.deliveredAt ?? null],
  );
}

export async function incrementOtpAttempts(id: string): Promise<number> {
  const { rows } = await pool.query<{ otp_attempts: number }>(
    'UPDATE tax_fetch_sessions SET otp_attempts = otp_attempts + 1, updated_at = now() WHERE id = $1 RETURNING otp_attempts',
    [id],
  );
  return rows[0]?.otp_attempts ?? 0;
}

/** Sessions whose live browser page a worker restart orphaned (boot sweep marks them expired). */
export async function listStaleLive(): Promise<TaxFetchSessionRow[]> {
  const { rows } = await pool.query<TaxFetchSessionRow>('SELECT * FROM tax_fetch_sessions WHERE status = ANY($1)', [
    LIVE_BROWSER_STATUSES,
  ]);
  return rows;
}
