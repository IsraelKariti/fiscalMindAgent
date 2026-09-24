import { createHash } from 'node:crypto';
import type { DocumentFileRow } from '../db/types.js';
import type { AuditEvent } from '../audit/audit.js';
import { AttemptsExhaustedError, errorSummary, withAttempts, type AttemptsOptions } from './ingestRetry.js';
import { logger } from '../util/logger.js';

/**
 * The store-with-retry of one inbound file (openspec `inbound-files`), with
 * every side effect injected: this module imports no database, storage or
 * queue client, so the unit test runs without a stack. `ingestInboundFile.ts`
 * wires the real dependencies.
 */

/** The client and message a batch of inbound files belongs to. */
export interface InboundFileContext {
  clientId: string;
  agentInstanceId: string | null;
  clientName: string;
  /** The inbound message row (emails.id), when it exists. */
  emailId: string | null;
  channel: 'whatsapp' | 'email';
}

/** One file of an inbound message, with how to fetch its bytes from the provider. */
export interface InboundFileItem {
  /** Provider attachment id (Resend) or MessageSid-index (Twilio) — the dedupe key. */
  providerAttachmentId: string;
  /** 0-based position in the message. */
  index: number;
  contentType: string;
  /** The stored filename, decided by the channel. */
  filename: string;
  /** What the message called the file (attachment name, WhatsApp caption); for the failure row only. */
  fileNameHint: string | null;
  /** Fetches the bytes from the provider; retried as a unit with the store. */
  download: () => Promise<Buffer>;
}

export interface InboundFileDeps {
  uploadBlob: (key: string, body: Buffer, contentType: string) => Promise<void>;
  insertIfNew: typeof import('../db/queries/documentFiles.js').insertIfNew;
  analyze: (clientId: string, file: DocumentFileRow, body: Buffer) => Promise<void>;
  recordAudit: (e: AuditEvent) => void;
  retry: AttemptsOptions;
}

/**
 * Fetches one file the client sent and persists it: bytes to Blob Storage
 * (deterministic key, so a re-run overwrites in place), metadata to
 * document_files (unique on the provider attachment id, so provider retries
 * insert nothing), then content analysis. Fetch + upload + insert are retried
 * as one unit; a file that fails every attempt is logged AND recorded as a
 * `file.ingest_failed` step on the client's trail, so the trace and the
 * planner both know it was lost. The webhook was acked long ago, so nothing
 * is thrown.
 *
 * Returns the stored row when this call inserted it, null when the file
 * already existed or was lost.
 */
export async function ingestInboundFileWith(
  ctx: InboundFileContext,
  item: InboundFileItem,
  deps: InboundFileDeps,
): Promise<DocumentFileRow | null> {
  const blobKey = `clients/${ctx.clientId}/${item.providerAttachmentId}/${item.filename}`;
  let stored: { inserted: DocumentFileRow | null; body: Buffer };
  try {
    const result = await withAttempts(async () => {
      const body = await item.download();
      await deps.uploadBlob(blobKey, body, item.contentType);
      const inserted = await deps.insertIfNew({
        clientId: ctx.clientId,
        emailId: ctx.emailId,
        providerAttachmentId: item.providerAttachmentId,
        blobKey,
        filename: item.filename,
        contentType: item.contentType,
        sizeBytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      });
      return { inserted, body };
    }, deps.retry);
    stored = result.value;
    if (result.attempts > 1) {
      logger.info('inbound file stored after retry', {
        clientId: ctx.clientId,
        channel: ctx.channel,
        providerAttachmentId: item.providerAttachmentId,
        attempts: result.attempts,
      });
    }
  } catch (err) {
    const attempts = err instanceof AttemptsExhaustedError ? err.attempts : 1;
    const cause = err instanceof AttemptsExhaustedError ? err.cause : err;
    logger.error('failed to ingest inbound file', err, {
      clientId: ctx.clientId,
      channel: ctx.channel,
      providerAttachmentId: item.providerAttachmentId,
      index: item.index,
      attempts,
    });
    deps.recordAudit({
      actorType: 'system',
      action: 'file.ingest_failed',
      severity: 'warning',
      agentInstanceId: ctx.agentInstanceId,
      clientId: ctx.clientId,
      targetType: ctx.emailId ? 'email' : null,
      targetId: ctx.emailId,
      detail: {
        channel: ctx.channel,
        providerAttachmentId: item.providerAttachmentId,
        index: item.index,
        contentType: item.contentType,
        fileNameHint: item.fileNameHint,
        attempts,
        error: errorSummary(cause),
        clientName: ctx.clientName,
      },
    });
    return null;
  }

  if (!stored.inserted) return null;
  logger.info('stored inbound file', {
    clientId: ctx.clientId,
    channel: ctx.channel,
    fileId: stored.inserted.id,
    filename: item.filename,
    contentType: item.contentType,
    size: stored.body.length,
  });
  // Analysis is not part of the retry: its own failure marks the file
  // analysed-with-error, which the turn treats as finished.
  try {
    await deps.analyze(ctx.clientId, stored.inserted, stored.body);
  } catch (err) {
    logger.error('inbound file analysis failed', err, { clientId: ctx.clientId, fileId: stored.inserted.id });
  }
  return stored.inserted;
}
