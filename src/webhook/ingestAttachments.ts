import { createHash } from 'node:crypto';
import * as documentFiles from '../db/queries/documentFiles.js';
import { uploadBlob } from '../storage/blob.js';
import { resend } from '../resend/client.js';
import { analyzeStoredFile } from './analyzeStoredFile.js';
import { logger } from '../util/logger.js';

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
 * Inline-referenced parts (content_id, no explicit `attachment` disposition)
 * this small are signature logos, social icons and spacers. Larger inline
 * parts are kept: Apple Mail sends real photo attachments as inline parts
 * with a content_id, and dropping on disposition alone loses those.
 */
const INLINE_JUNK_MAX_BYTES = 50 * 1024;

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
    // Skip small parts embedded inline in the HTML body (signature logos,
    // embedded images). A content_id alone is not enough to tell: Gmail stamps
    // one on real photo attachments too, so an explicit `attachment`
    // disposition always wins; and Apple Mail marks real photos inline, so
    // only inline parts small enough to be decorative are dropped.
    const disposition = (att.content_disposition ?? '').trim().toLowerCase();
    const inline = Boolean(att.content_id) && !disposition.startsWith('attachment');
    // A missing/zero size drops too — real photos always report one.
    if (inline && !(att.size > INLINE_JUNK_MAX_BYTES)) continue;

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
        providerAttachmentId: att.id,
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
