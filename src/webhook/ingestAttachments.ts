import { createHash } from 'node:crypto';
import * as clients from '../db/queries/clients.js';
import * as clientDocuments from '../db/queries/clientDocuments.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import * as users from '../db/queries/users.js';
import { analyzeFile, isAnalyzable } from '../gemini/analyzeFile.js';
import { uploadBlob } from '../storage/blob.js';
import { resend } from '../resend/client.js';
import { logger } from '../util/logger.js';
import type { DocumentFileRow } from '../db/types.js';

/** Attachment metadata as embedded in the Resend receiving GET response. */
export interface InboundAttachmentMeta {
  id: string;
  filename: string | null;
  size: number;
  content_type: string;
  content_id: string | null;
  content_disposition: string | null;
}

/** Blob names stay predictable and URL-safe regardless of what the client's mail app sent. */
function sanitizeFilename(filename: string | null): string {
  const safe = (filename ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 120);
  return safe || 'attachment';
}

/**
 * Downloads each real attachment from Resend and persists it: bytes to Blob
 * Storage (deterministic key, so re-runs overwrite in place), metadata to
 * document_files (unique on the Resend attachment id, so duplicate webhook
 * deliveries insert nothing). Failures are per-attachment and logged — the
 * webhook has already been acked, so there is no retry to throw to.
 *
 * Returns the number of newly stored files.
 */
export async function ingestAttachments(
  clientId: string,
  emailId: string | null,
  resendEmailId: string,
  attachments: InboundAttachmentMeta[],
): Promise<number> {
  let stored = 0;
  for (const att of attachments) {
    // content_id means the part is referenced inline from the HTML body
    // (signature logos, embedded images) — not a document the client sent.
    if (att.content_id) continue;

    try {
      const { data, error } = await resend.emails.receiving.attachments.get({ emailId: resendEmailId, id: att.id });
      if (error || !data) {
        throw new Error(`fetch attachment meta failed: ${error?.name ?? 'unknown'} ${error?.message ?? ''}`);
      }
      const response = await fetch(data.download_url);
      if (!response.ok) throw new Error(`attachment download returned ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());

      const filename = sanitizeFilename(att.filename ?? data.filename ?? null);
      const contentType = att.content_type || 'application/octet-stream';
      const blobKey = `clients/${clientId}/${att.id}/${filename}`;
      await uploadBlob(blobKey, body, contentType);

      const inserted = await documentFiles.insertIfNew({
        clientId,
        emailId,
        resendAttachmentId: att.id,
        blobKey,
        filename,
        contentType,
        sizeBytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      });
      if (inserted) {
        stored += 1;
        logger.info('stored inbound attachment', { clientId, fileId: inserted.id, filename, size: body.length });
        await analyzeStoredFile(clientId, inserted, body);
      }
    } catch (err) {
      logger.error('failed to ingest attachment', err, { clientId, resendEmailId, attachmentId: att.id });
    }
  }
  return stored;
}

/**
 * Reads the file's actual contents with Gemini and stores the verdict on the
 * row, so the decision loop judges receipt from content rather than filename.
 * Failures only mark the row 'failed' — the file itself is already stored and
 * the decision prompt treats missing analysis as "judge from context".
 */
async function analyzeStoredFile(clientId: string, file: DocumentFileRow, body: Buffer): Promise<void> {
  if (!isAnalyzable(file.content_type, body.length)) {
    await documentFiles.setAnalysis(file.id, 'unsupported', null);
    logger.info('attachment not analyzable, skipping content analysis', {
      clientId,
      fileId: file.id,
      contentType: file.content_type,
      size: body.length,
    });
    return;
  }
  try {
    const requiredDocuments = await clientDocuments.listForClient(clientId);
    const { analysis, usage } = await analyzeFile(body, file.content_type, file.filename, requiredDocuments);
    await documentFiles.setAnalysis(file.id, 'done', analysis);
    const client = await clients.getById(clientId);
    if (client?.user_id) {
      await users.addLlmTokens(client.user_id, usage);
    }
    logger.info('attachment content analyzed', {
      clientId,
      fileId: file.id,
      documentKind: analysis.document_kind,
      matchedDocumentId: analysis.matched_document_id,
      confidence: analysis.confidence,
    });
  } catch (err) {
    await documentFiles.setAnalysis(file.id, 'failed', null).catch(() => {});
    logger.error('attachment content analysis failed', err, { clientId, fileId: file.id });
  }
}
