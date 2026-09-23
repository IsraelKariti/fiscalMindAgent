import { createHash } from 'node:crypto';
import * as documentFiles from '../db/queries/documentFiles.js';
import { uploadBlob } from '../storage/blob.js';
import { env } from '../config/env.js';
import { analyzeStoredFile } from './analyzeStoredFile.js';
import { isAllowedTwilioMediaUrl } from './twilioMediaUrl.js';
import { logger } from '../util/logger.js';

export interface WaMediaItem {
  url: string;
  contentType: string;
}

/**
 * WhatsApp media carries no usable filename: the webhook body has none, and
 * the download's Content-Disposition replaces every non-ASCII letter with "?".
 * The stored name is built from the receipt time (Israel clock, so the
 * accountant reads it as sent) plus, for a multi-file message, the file's
 * position: whatsapp-media-<yyyymmdd-hhmmss>[-<n>].<ext>.
 */
export function waMediaFilename(receivedAt: Date, index: number, count: number, extension: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(receivedAt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const stamp = `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
  const suffix = count > 1 ? `-${index + 1}` : '';
  return `whatsapp-media-${stamp}${suffix}.${extension}`;
}

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
  const receivedAt = new Date();
  for (const [index, item] of media.entries()) {
    try {
      // The URL came from the webhook body — only ever fetch Twilio's own
      // hosts, since the request below carries the account credentials.
      if (!isAllowedTwilioMediaUrl(item.url)) {
        logger.warn('skipped whatsapp media with non-Twilio url', { clientId, messageSid, index });
        continue;
      }
      // Twilio media URLs require Basic auth (the API credentials), then
      // redirect to storage; undici drops the header on the cross-origin hop.
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const response = await fetch(item.url, { headers: { Authorization: `Basic ${auth}` } });
      if (!response.ok) throw new Error(`media download returned ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());

      const contentType = item.contentType || 'application/octet-stream';
      const extension = EXTENSION_BY_TYPE[contentType.toLowerCase()] ?? 'bin';
      const filename = waMediaFilename(receivedAt, index, media.length, extension);
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
