import { pool } from '../pool.js';
import type { DocumentFileRow, FileAnalysis, FileAnalysisStatus, InjectionBlock } from '../types.js';

export async function listForClient(clientId: string): Promise<DocumentFileRow[]> {
  const { rows } = await pool.query<DocumentFileRow>(
    'SELECT * FROM document_files WHERE client_id = $1 ORDER BY created_at, id',
    [clientId],
  );
  return rows;
}

export async function getById(id: string): Promise<DocumentFileRow | null> {
  const { rows } = await pool.query<DocumentFileRow>('SELECT * FROM document_files WHERE id = $1', [id]);
  return rows[0] ?? null;
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
  /** Display label when the filename isn't descriptive (multi-employer 106s carry the employer name). */
  label?: string | null;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  /** 'not_needed' for files the platform fetched itself (already linked; content analysis does not apply). Default 'pending'. */
  analysisStatus?: 'pending' | 'not_needed';
  /** A child cut out of a multi-document PDF (058): its parent and its 1-based, inclusive page range. */
  parentFileId?: string | null;
  pageFrom?: number | null;
  pageTo?: number | null;
}): Promise<DocumentFileRow | null> {
  const { rows } = await pool.query<DocumentFileRow>(
    `INSERT INTO document_files (client_id, email_id, provider_attachment_id, blob_key, filename, label, content_type, size_bytes, sha256, analysis_status, parent_file_id, page_from, page_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (provider_attachment_id) DO NOTHING
     RETURNING *`,
    [
      args.clientId,
      args.emailId,
      args.providerAttachmentId,
      args.blobKey,
      args.filename,
      args.label ?? null,
      args.contentType,
      args.sizeBytes,
      args.sha256,
      args.analysisStatus ?? 'pending',
      args.parentFileId ?? null,
      args.pageFrom ?? null,
      args.pageTo ?? null,
    ],
  );
  return rows[0] ?? null;
}

/**
 * Files of the client still waiting for an analysis result, stored within the
 * last `sinceSeconds` — the deferred re-plan waits for them (openspec
 * `inbound-turn`). Older pending rows are abandoned analyses, not a running turn.
 */
export async function countRecentPendingForClient(clientId: string, sinceSeconds: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) AS count FROM document_files
     WHERE client_id = $1 AND analysis_status = 'pending' AND created_at > now() - make_interval(secs => $2)`,
    [clientId, sinceSeconds],
  );
  return Number(rows[0]?.count ?? 0);
}

/** The children cut out of a split file, in page order. */
export async function listChildren(parentFileId: string): Promise<DocumentFileRow[]> {
  const { rows } = await pool.query<DocumentFileRow>(
    'SELECT * FROM document_files WHERE parent_file_id = $1 ORDER BY page_from, id',
    [parentFileId],
  );
  return rows;
}

/** Removes the children of a split that failed half-way (the parent is then classified whole). Returns their blob keys. */
export async function deleteChildren(parentFileId: string): Promise<string[]> {
  const { rows } = await pool.query<{ blob_key: string }>(
    'DELETE FROM document_files WHERE parent_file_id = $1 RETURNING blob_key',
    [parentFileId],
  );
  return rows.map((r) => r.blob_key);
}

/** The file was cut into one child per document (058): it is never classified itself. */
export async function setSplit(id: string): Promise<void> {
  await pool.query(`UPDATE document_files SET analysis_status = 'split', analysis = NULL, analyzed_at = now() WHERE id = $1`, [id]);
}

/** Stores the content-analysis verdict for a file (analysis is null unless status is 'done'). */
export async function setAnalysis(id: string, status: FileAnalysisStatus, analysis: FileAnalysis | null): Promise<void> {
  await pool.query(
    `UPDATE document_files SET analysis_status = $2, analysis = $3, analyzed_at = now() WHERE id = $1`,
    [id, status, analysis === null ? null : JSON.stringify(analysis)],
  );
}

/** The injection screen flagged the file: quarantined before classification (054). */
export async function setBlocked(id: string, blocked: InjectionBlock): Promise<void> {
  await pool.query(
    `UPDATE document_files SET analysis_status = 'blocked', analysis = NULL, blocked = $2, analyzed_at = now() WHERE id = $1`,
    [id, JSON.stringify(blocked)],
  );
}

/** Sets or clears the display label of a file (a split child is named after its matched list document). */
export async function setLabel(id: string, label: string | null): Promise<void> {
  await pool.query('UPDATE document_files SET label = $2 WHERE id = $1 AND label IS DISTINCT FROM $2', [id, label]);
}

/** Records which required document a file satisfies (no-op if the file isn't the client's). */
export async function linkToDocument(id: string, clientId: string, clientDocumentId: string): Promise<void> {
  await pool.query(
    'UPDATE document_files SET client_document_id = $3 WHERE id = $1 AND client_id = $2',
    [id, clientId, clientDocumentId],
  );
}
