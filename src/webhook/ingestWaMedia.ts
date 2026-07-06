import { createHash } from 'node:crypto';
import * as documentFiles from '../db/queries/documentFiles.js';
import { uploadBlob } from '../storage/blob.js';
import { env } from '../config/env.js';
import { analyzeStoredFile } from './analyzeStoredFile.js';
import { logger } from '../util/logger.js';

export interface WaMediaItem {
  url: string;
  contentType: string;
}

/** WhatsApp media carries no filename — derive one from the content type. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
};

/**
 * Downloads each media item of an inbound WhatsApp message from Twilio and
 * persists it exactly like an email attachment: bytes to Blob Storage,
 * metadata to document_files (unique on MessageSid-index, so Twilio retries
 * insert nothing), then Gemini content analysis. Failures are per-item and
 * logged — the webhook has already been acked.
 *
 * Returns the number of newly stored files.
 */
export async function ingestWaMedia(
  clientId: string,
  emailId: string | null,
  messageSid: string,
  media: WaMediaItem[],
): Promise<number> {
  let stored = 0;
  for (const [index, item] of media.entries()) {
    try {
      // Twilio media URLs require Basic auth (the API credentials), then
      // redirect to storage; undici drops the header on the cross-origin hop.
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const response = await fetch(item.url, { headers: { Authorization: `Basic ${auth}` } });
      if (!response.ok) throw new Error(`media download returned ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());

      const contentType = item.contentType || 'application/octet-stream';
      const extension = EXTENSION_BY_TYPE[contentType.toLowerCase()] ?? 'bin';
      const filename = `whatsapp-media-${index + 1}.${extension}`;
      const providerAttachmentId = `${messageSid}-${index}`;
      const blobKey = `clients/${clientId}/${providerAttachmentId}/${filename}`;
      await uploadBlob(blobKey, body, contentType);

      const inserted = await documentFiles.insertIfNew({
        clientId,
        emailId,
        providerAttachmentId,
        blobKey,
        filename,
        contentType,
        sizeBytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      });
      if (inserted) {
        stored += 1;
        logger.info('stored inbound whatsapp media', { clientId, fileId: inserted.id, contentType, size: body.length });
        await analyzeStoredFile(clientId, inserted, body);
      }
    } catch (err) {
      logger.error('failed to ingest whatsapp media', err, { clientId, messageSid, index });
    }
  }
  return stored;
}
