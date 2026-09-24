import { env } from '../config/env.js';
import { ingestInboundFile, type InboundFileContext } from './ingestInboundFile.js';
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
 * persists it exactly like an email attachment (see ingestInboundFile: retried
 * as a unit, a lost file becomes a `file.ingest_failed` step). Failures are
 * per-item — the webhook has already been acked.
 *
 * `caption` is the message text Twilio delivered with the media: for a
 * document it is the file's original name, which is all the failure row can
 * say about a file that never arrived.
 *
 * Returns the number of newly stored files.
 */
export async function ingestWaMedia(
  ctx: Omit<InboundFileContext, 'channel'>,
  messageSid: string,
  media: WaMediaItem[],
  caption: string,
): Promise<number> {
  let stored = 0;
  const receivedAt = new Date();
  const fileNameHint = caption.trim() === '' ? null : caption.trim().slice(0, 200);
  for (const [index, item] of media.entries()) {
    // The URL came from the webhook body — only ever fetch Twilio's own
    // hosts, since the request below carries the account credentials.
    if (!isAllowedTwilioMediaUrl(item.url)) {
      logger.warn('skipped whatsapp media with non-Twilio url', { clientId: ctx.clientId, messageSid, index });
      continue;
    }
    const contentType = item.contentType || 'application/octet-stream';
    const extension = EXTENSION_BY_TYPE[contentType.toLowerCase()] ?? 'bin';
    const inserted = await ingestInboundFile(
      { ...ctx, channel: 'whatsapp' },
      {
        providerAttachmentId: `${messageSid}-${index}`,
        index,
        contentType,
        filename: waMediaFilename(receivedAt, index, media.length, extension),
        fileNameHint,
        download: () => downloadTwilioMedia(item.url),
      },
    );
    if (inserted) stored += 1;
  }
  return stored;
}

/**
 * Twilio media URLs require Basic auth (the API credentials), then redirect
 * to storage; undici drops the header on the cross-origin hop.
 */
async function downloadTwilioMedia(url: string): Promise<Buffer> {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!response.ok) throw new Error(`media download returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
