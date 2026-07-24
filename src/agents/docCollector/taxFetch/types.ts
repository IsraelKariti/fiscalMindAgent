/**
 * Worker-side tax-fetch types. Deliberately free of Playwright: the worker
 * never touches a browser — real fetches run in the secret-free browser-runner
 * sidecar (src/browserRunner.ts) and cross an HTTP trust boundary, so what
 * comes back is data to validate, not objects to trust.
 */

export interface FetchedDocument {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface PortalLoginCredentials {
  idNumber: string;
  userCode: string;
}

/** The site said the OTP was wrong; the login can be retried with a new code. */
export class OtpRejectedError extends Error {
  constructor(message = 'the tax authority rejected the one-time code') {
    super(message);
    this.name = 'OtpRejectedError';
  }
}

/** The runner no longer holds this session (TTL, restart) — treat as expired. */
export class SessionGoneError extends Error {
  constructor(message = 'the browser session is gone') {
    super(message);
    this.name = 'SessionGoneError';
  }
}

/** The runner is already driving its maximum number of browsers. */
export class FetchAtCapacityError extends Error {
  constructor(message = 'the browser runner is at capacity') {
    super(message);
    this.name = 'FetchAtCapacityError';
  }
}

/**
 * Reduces a runner-supplied filename to a safe basename before it is embedded
 * in a blob key: the name ultimately comes from the external site (download
 * headers/URL), so path separators and traversal must not survive.
 */
export function sanitizeFilename(name: string, fallback = 'document.pdf'): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // Keep word chars, dot, dash, space and the Hebrew block (U+0590–U+05FF).
  const cleaned = base
    .replace(/[^\w.\- ֐-׿]+/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || fallback;
}
