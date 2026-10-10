import { env } from '../config/env.js';
import { ingestInboundFile, type InboundFileContext } from './ingestInboundFile.js';
import { isAllowedTwilioMediaUrl } from './twilioMediaUrl.js';
import { logger } from '../util/logger.js';
import { waMediaExtension, waMediaFilename } from './waMediaName.js';

export { waMediaExtension, waMediaFilename } from './waMediaName.js';

export interface WaMediaItem {
  url: string;
  contentType: string;
}

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
    const extension = waMediaExtension(contentType);
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
