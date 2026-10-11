import { randomBytes } from 'node:crypto';

/**
 * Pictures shown next to an agent on WhatsApp, in one order: the agent
 * instance's own icon (agent_instances.logo_blob_key), else the app logo an
 * admin uploaded (app_settings key app_logo_blob_key), else the built-in
 * petal seal shipped with the web app (web/public/petal-seal.png).
 *
 * Uploaded pictures live in the private blob container under unguessable
 * keys and are served by the public /logos/:key route (src/webhook/logoRoute.ts);
 * a replacement always gets a new key, so a new URL, which is what makes
 * Twilio (planSenderUpdate) notice the change. Pure: no env, no DB.
 */

/** app_settings key holding the blob key of the admin-uploaded app logo. */
export const APP_LOGO_SETTING_KEY = 'app_logo_blob_key';

export const LOGO_KEY_PREFIX = 'logos/';
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Path of the built-in default under APP_BASE_URL (static web/public file). */
export const DEFAULT_LOGO_PATH = '/petal-seal.png';

export type LogoImageType = { ext: 'png'; contentType: 'image/png' } | { ext: 'jpg'; contentType: 'image/jpeg' };

/** PNG or JPEG by magic bytes (never by the request header); null for anything else, including SVG. */
export function sniffImageType(bytes: Uint8Array): LogoImageType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  return null;
}

/** A fresh blob key: logos/<32 hex>.<ext> — 128 random bits, so the public URL cannot be guessed. */
export function newLogoBlobKey(ext: LogoImageType['ext']): string {
  return `${LOGO_KEY_PREFIX}${randomBytes(16).toString('hex')}.${ext}`;
}

const KEY_RE = /^[0-9a-f]{32}\.(png|jpg)$/;

/** The blob key behind a /logos/:key path segment, or null when the segment is not one we would have issued. */
export function logoBlobKeyFromPath(segment: string): string | null {
  return KEY_RE.test(segment) ? `${LOGO_KEY_PREFIX}${segment}` : null;
}

function base(appBaseUrl: string): string {
  return appBaseUrl.replace(/\/$/, '');
}

/** Public URL of an uploaded picture. */
export function logoUrl(blobKey: string, appBaseUrl: string): string {
  return `${base(appBaseUrl)}/${blobKey}`;
}

/** Public URL of the built-in default. */
export function defaultLogoUrl(appBaseUrl: string): string {
  return `${base(appBaseUrl)}${DEFAULT_LOGO_PATH}`;
}

export type PictureLevel = 'agent' | 'app' | 'default';

export interface EffectivePicture {
  url: string;
  level: PictureLevel;
}

/** The picture an instance shows, and which of the three levels it comes from. */
export function effectivePictureUrl(input: {
  instanceKey: string | null | undefined;
  appLogoKey: string | null | undefined;
  appBaseUrl: string;
}): EffectivePicture {
  if (input.instanceKey) return { url: logoUrl(input.instanceKey, input.appBaseUrl), level: 'agent' };
  if (input.appLogoKey) return { url: logoUrl(input.appLogoKey, input.appBaseUrl), level: 'app' };
  return { url: defaultLogoUrl(input.appBaseUrl), level: 'default' };
}

/**
 * The URL to hand Twilio for the sender profile. Meta fetches the image
 * itself, so only a public https URL is usable — a plain http base (local
 * dev) yields undefined and the caller skips the picture with a log line.
 */
export function senderPictureUrl(input: Parameters<typeof effectivePictureUrl>[0]): string | undefined {
  const { url } = effectivePictureUrl(input);
  return url.startsWith('https://') ? url : undefined;
}
