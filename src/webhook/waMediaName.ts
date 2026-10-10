// The stored name of a WhatsApp media item: pure (no env, no queue, no
// storage), so the unit test imports it without the webhook stack.

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
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
};

/** The stored extension for a Twilio media content type; 'bin' when the type is not one we name. */
export function waMediaExtension(contentType: string): string {
  return EXTENSION_BY_TYPE[contentType.toLowerCase()] ?? 'bin';
}
