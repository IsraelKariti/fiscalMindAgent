import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Short-lived signed URLs for document blobs, so Twilio (which fetches media
 * server-side, with no session cookie) can pull a file the agent sends over
 * WhatsApp. The blob container itself stays private; the token is an
 * unguessable, expiring capability for exactly one file.
 */

const TOKEN_TTL_MS = 15 * 60_000;

function secret(): string {
  if (!env.MEDIA_SIGNING_SECRET) {
    throw new Error('MEDIA_SIGNING_SECRET is not set — cannot sign media URLs for WhatsApp delivery');
  }
  return env.MEDIA_SIGNING_SECRET;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** The public origin Twilio can reach — the same host inbound webhooks arrive on. */
function publicBase(): string {
  if (!env.TWILIO_WEBHOOK_URL) {
    throw new Error('TWILIO_WEBHOOK_URL is not set — cannot build a publicly reachable media URL');
  }
  return new URL(env.TWILIO_WEBHOOK_URL).origin;
}

export function buildSignedMediaUrl(fileId: string, ttlMs: number = TOKEN_TTL_MS): string {
  const exp = String(Date.now() + ttlMs);
  const payload = `${fileId}.${exp}`;
  const token = Buffer.from(`${payload}.${sign(payload)}`).toString('base64url');
  return `${publicBase()}/media/${token}`;
}

/** Returns the file id if the token is valid and unexpired, else null. */
export function verifyMediaToken(token: string): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const parts = decoded.split('.');
  if (parts.length !== 3) return null;
  const [fileId, exp, providedSig] = parts as [string, string, string];
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || Date.now() > expMs) return null;

  const expectedSig = sign(`${fileId}.${exp}`);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return fileId;
}
