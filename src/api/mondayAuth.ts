import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import * as mondayAccounts from '../db/queries/mondayAccounts.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Verified monday identity (set by requireMondayIdentity). */
      monday?: { accountId: string; userId: string };
    }
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function b64urlJson(part: string): unknown {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Verifies the sessionToken the monday SDK hands the widget iframe: an HS256
 * JWT signed with the app's Client Secret, carrying the monday account/user
 * ids under `dat`. Hand-rolled like the session-cookie HMAC in auth.ts — HS256
 * is just HMAC-SHA256 over `<header>.<payload>`.
 */
export function verifyMondaySessionToken(token: string): { accountId: string; userId: string } | null {
  if (!env.MONDAY_CLIENT_SECRET) return null;
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const expected = crypto
    .createHmac('sha256', env.MONDAY_CLIENT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  if (!timingSafeEqual(signature, expected)) return null;

  const head = b64urlJson(header) as { alg?: string } | null;
  if (head?.alg !== 'HS256') return null;
  const body = b64urlJson(payload) as {
    exp?: number;
    dat?: { account_id?: number | string; user_id?: number | string };
  } | null;
  if (!body?.dat) return null;
  if (typeof body.exp === 'number' && body.exp * 1000 < Date.now()) return null;
  const { account_id: accountId, user_id: userId } = body.dat;
  if (accountId == null || userId == null) return null;
  return { accountId: String(accountId), userId: String(userId) };
}

/**
 * Verifies the sessionToken and attaches the monday identity; 503 while
 * unconfigured. The token normally rides the Authorization header; a
 * `?sessionToken=` query fallback covers EventSource (SSE) and file-download
 * links, which cannot set headers. The tokens expire within minutes, so a
 * leaked URL goes stale almost immediately.
 */
export const requireMondayIdentity: RequestHandler = (req, res, next) => {
  if (!env.MONDAY_CLIENT_SECRET) {
    res.status(503).json({ error: 'The monday integration is not configured (set MONDAY_CLIENT_SECRET).' });
    return;
  }
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const query = typeof req.query.sessionToken === 'string' ? req.query.sessionToken : null;
  const token = bearer ?? query;
  const identity = token ? verifyMondaySessionToken(token) : null;
  if (!identity) {
    res.status(401).json({ error: 'Invalid monday session token.' });
    return;
  }
  req.monday = identity;
  next();
};

/**
 * Resolves the monday identity to a fiscalMind user. Runs after
 * requireMondayIdentity; the widget calls POST /api/monday/session (which
 * provisions the mapping) before anything guarded by this.
 */
export const requireMondayUser: RequestHandler = async (req, res, next) => {
  try {
    const mapping = await mondayAccounts.getByMondayIds(req.monday!.accountId, req.monday!.userId);
    if (!mapping) {
      res.status(401).json({ error: 'This monday user has no fiscalMind account yet.', code: 'not_provisioned' });
      return;
    }
    req.userId = mapping.user_id;
    req.realUserId = mapping.user_id;
    next();
  } catch (err) {
    next(err);
  }
};

// "Link existing account" tokens: issued to an authenticated monday user, then
// carried through the top-level Google OAuth popup so the callback knows which
// monday identity to link. Signed with the client secret (domain-separated
// from the JWTs above) and short-lived — the signature proves the link was
// requested from inside that monday user's widget, not crafted by a third party.
const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

function signLinkPayload(payload: string): string {
  return crypto.createHmac('sha256', `monday-link:${env.MONDAY_CLIENT_SECRET ?? ''}`).update(payload).digest('base64url');
}

export function createMondayLinkToken(accountId: string, userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ a: accountId, u: userId, exp: Date.now() + LINK_TOKEN_TTL_MS }),
  ).toString('base64url');
  return `${payload}.${signLinkPayload(payload)}`;
}

export function verifyMondayLinkToken(token: string): { accountId: string; userId: string } | null {
  if (!env.MONDAY_CLIENT_SECRET) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !timingSafeEqual(signature, signLinkPayload(payload))) return null;
  const parsed = b64urlJson(payload) as { a?: string; u?: string; exp?: number } | null;
  if (!parsed || typeof parsed.a !== 'string' || typeof parsed.u !== 'string') return null;
  if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
  return { accountId: parsed.a, userId: parsed.u };
}
