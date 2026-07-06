import { pool } from '../pool.js';
import type { DocumentFileRow, FileAnalysis, FileAnalysisStatus } from '../types.js';

export async function listForClient(clientId: string): Promise<DocumentFileRow[]> {
  const { rows } = await pool.query<DocumentFileRow>(
    'SELECT * FROM document_files WHERE client_id = $1 ORDER BY created_at, id',
    [clientId],
  );
  return rows;
}

export async function getForClient(id: string, clientId: string): Promise<DocumentFileRow | null> {
  const { rows } = await pool.query<DocumentFileRow>(
    'SELECT * FROM document_files WHERE id = $1 AND client_id = $2',
    [id, clientId],
  );
  return rows[0] ?? null;
}

/** Returns the inserted row, or null if this attachment was already ingested (idempotent). */
export async function insertIfNew(args: {
  clientId: string;
  emailId: string | null;
  /** Resend attachment id (email) or Twilio MessageSid-index (whatsapp media) — the dedupe key. */
  providerAttachmentId: string;
  blobKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}): Promise<DocumentFileRow | null> {
  const { rows } = await pool.query<DocumentFileRow>(
    `INSERT INTO document_files (client_id, email_id, provider_attachment_id, blob_key, filename, content_type, size_bytes, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (provider_attachment_id) DO NOTHING
     RETURNING *`,
    [
      args.clientId,
      args.emailId,
      args.providerAttachmentId,
      args.blobKey,
      args.filename,
      args.contentType,
      args.sizeBytes,
      args.sha256,
    ],
  );
  return rows[0] ?? null;
}

/** Stores the content-analysis verdict for a file (analysis is null unless status is 'done'). */
export async function setAnalysis(id: string, status: FileAnalysisStatus, analysis: FileAnalysis | null): Promise<void> {
  await pool.query(
    `UPDATE document_files SET analysis_status = $2, analysis = $3, analyzed_at = now() WHERE id = $1`,
    [id, status, analysis === null ? null : JSON.stringify(analysis)],
  );
}

/** Records which required document a file satisfies (no-op if the file isn't the client's). */
export async function linkToDocument(id: string, clientId: string, clientDocumentId: string): Promise<void> {
  await pool.query(
    'UPDATE document_files SET client_document_id = $3 WHERE id = $1 AND client_id = $2',
    [id, clientId, clientDocumentId],
  );
}
