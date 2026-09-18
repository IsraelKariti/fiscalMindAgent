/**
 * Pure evaluation of the admin "view as accountant" cookie — no env, no I/O,
 * so it is unit-testable (tests/impersonationCookie.test.ts). auth.ts wires it
 * to the real signing secret, clock and idle period.
 *
 * Cookie format: <adminUserId>.<targetUserId>.<expiresAtMs>.<hmac of the first three>.
 * The session is sliding: expiresAt = last user activity + idle period.
 */

/**
 * Re-issue the cookie only once this much of the idle period is used — not a
 * Set-Cookie per response. Capped at a tenth of the idle period, so a short
 * period (minutes) still slides instead of expiring before its first refresh.
 */
export const IMPERSONATION_REFRESH_AFTER_MS = 60_000;

export function refreshAfterMs(idleMs: number): number {
  return Math.min(IMPERSONATION_REFRESH_AFTER_MS, idleMs / 10);
}

export type ImpersonationCookieState =
  /** No cookie, or one that must be ignored: malformed, badly signed, or issued to another admin. */
  | { state: 'none' }
  /** Valid and within its idle period. `refresh`: enough of the period is used to re-issue it. */
  | { state: 'active'; targetUserId: string; refresh: boolean }
  /** Genuine (signature + admin match) but idled out — lets the caller audit the expiry. */
  | { state: 'expired'; targetUserId: string };

export function evaluateImpersonationCookie(
  cookie: string | null,
  realUserId: string,
  now: number,
  idleMs: number,
  sign: (payload: string) => string,
  signaturesMatch: (a: string, b: string) => boolean,
): ImpersonationCookieState {
  if (!cookie) return { state: 'none' };
  const [adminUserId, targetUserId, expiresAt, signature, ...extra] = cookie.split('.');
  if (!adminUserId || !targetUserId || !expiresAt || !signature || extra.length > 0) return { state: 'none' };
  if (!/^\d+$/.test(expiresAt)) return { state: 'none' };
  if (!signaturesMatch(signature, sign(`${adminUserId}.${targetUserId}.${expiresAt}`))) return { state: 'none' };
  if (adminUserId !== realUserId) return { state: 'none' };
  const remaining = Number(expiresAt) - now;
  if (remaining < 0) return { state: 'expired', targetUserId };
  return { state: 'active', targetUserId, refresh: idleMs - remaining > refreshAfterMs(idleMs) };
}
