import crypto from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import * as users from '../db/queries/users.js';
import { logger } from '../util/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Effective user set by requireAuth — the impersonated user while an admin is impersonating. */
      userId?: string;
      /** Real signed-in user; differs from userId only during impersonation. */
      realUserId?: string;
    }
  }
}

const SESSION_COOKIE = 'fm_session';
const STATE_COOKIE = 'fm_oauth_state';
const IMPERSONATION_COOKIE = 'fm_impersonate';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const IMPERSONATION_TTL_MS = 4 * 60 * 60 * 1000;

const sessionSecret = env.DASHBOARD_SESSION_SECRET ?? crypto.randomBytes(32).toString('hex');

const IDENTITY_SCOPES = ['openid', 'email', 'profile'];

function loginRedirectUri(): string {
  return `${env.APP_BASE_URL}/api/auth/google/callback`;
}

function createLoginOAuthClient(): OAuth2Client {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('Google sign-in is not configured (set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).');
  }
  return new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET, loginRedirectUri());
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Sets a short-lived signed CSRF state cookie for an OAuth redirect flow. */
export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(STATE_COOKIE, `${state}.${sign(state)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_BASE_URL.startsWith('https://'),
    maxAge: STATE_TTL_MS,
    path: '/',
  });
}

/** Reads + clears the state cookie; returns its value only if the signature checks out. */
export function consumeOAuthStateCookie(req: Request, res: Response): string | null {
  const cookie = readCookie(req, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, { path: '/' });
  if (!cookie) return null;
  const [value, signature] = cookie.split('.');
  if (!value || !signature || !timingSafeEqual(signature, sign(value))) return null;
  return value;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Session cookie format: <userId>.<expiresAtMs>.<hmac of "userId.expiresAtMs">. */
function sessionUserId(req: Request): string | null {
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return null;
  const [userId, expiresAt, signature] = cookie.split('.');
  if (!userId || !expiresAt || !signature) return null;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return null;
  if (!timingSafeEqual(signature, sign(`${userId}.${expiresAt}`))) return null;
  return userId;
}

function setSessionCookie(res: Response, userId: string): void {
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  const value = `${userId}.${expiresAt}.${sign(`${userId}.${expiresAt}`)}`;
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_BASE_URL.startsWith('https://'),
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function isAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Impersonation cookie format: <adminUserId>.<targetUserId>.<expiresAtMs>.<hmac of the first three>.
 * Admin status is checked when the cookie is issued (POST /api/admin/impersonate); at request time
 * the cookie only takes effect when its adminUserId matches the real session user.
 */
export function setImpersonationCookie(res: Response, adminUserId: string, targetUserId: string): void {
  const expiresAt = String(Date.now() + IMPERSONATION_TTL_MS);
  const payload = `${adminUserId}.${targetUserId}.${expiresAt}`;
  res.cookie(IMPERSONATION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_BASE_URL.startsWith('https://'),
    maxAge: IMPERSONATION_TTL_MS,
    path: '/',
  });
}

export function clearImpersonationCookie(res: Response): void {
  res.clearCookie(IMPERSONATION_COOKIE, { path: '/' });
}

function impersonationTarget(req: Request, realUserId: string): string | null {
  const cookie = readCookie(req, IMPERSONATION_COOKIE);
  if (!cookie) return null;
  const [adminUserId, targetUserId, expiresAt, signature] = cookie.split('.');
  if (!adminUserId || !targetUserId || !expiresAt || !signature) return null;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return null;
  if (!timingSafeEqual(signature, sign(`${adminUserId}.${targetUserId}.${expiresAt}`))) return null;
  if (adminUserId !== realUserId) return null;
  return targetUserId;
}

/** Resolves the signed-in user plus the effective user (the impersonated one, when active). */
export function resolveIdentity(req: Request): { realUserId: string; effectiveUserId: string } | null {
  const realUserId = sessionUserId(req);
  if (!realUserId) return null;
  const target = impersonationTarget(req, realUserId);
  return { realUserId, effectiveUserId: target ?? realUserId };
}

/** GET /api/auth/google — kick off the Google sign-in consent redirect. */
export const startGoogleLogin: RequestHandler = (_req, res) => {
  let oauth: OAuth2Client;
  try {
    oauth = createLoginOAuthClient();
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  setOAuthStateCookie(res, state);
  res.redirect(oauth.generateAuthUrl({ scope: IDENTITY_SCOPES, state }));
};

/** GET /api/auth/google/callback — code exchange, user upsert, session issue. */
export const googleLoginCallback: RequestHandler = async (req, res) => {
  const fail = (reason: string): void => {
    logger.warn('google login failed', { reason });
    res.redirect(`/?login_error=${encodeURIComponent(reason)}`);
  };

  const expectedState = consumeOAuthStateCookie(req, res);
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code || !state || !expectedState) return fail('missing code or state');
  if (state !== expectedState) return fail('state mismatch');

  const oauth = createLoginOAuthClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.id_token) return fail('no id_token returned');

  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_OAUTH_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) return fail('id_token missing sub/email');

  const user = await users.upsertFromGoogle({
    googleSub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    pictureUrl: payload.picture ?? null,
  });
  setSessionCookie(res, user.id);
  res.redirect('/');
};

export const logout: RequestHandler = (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  clearImpersonationCookie(res);
  res.json({ ok: true });
};

/** GET /api/me — session + profile for the SPA. `user` is always the real signed-in user. */
export const me: RequestHandler = async (req, res) => {
  const identity = resolveIdentity(req);
  if (!identity) {
    res.json({ authenticated: false });
    return;
  }
  const user = await users.getById(identity.realUserId);
  if (!user) {
    // Signed cookie for a deleted user — treat as signed out.
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    clearImpersonationCookie(res);
    res.json({ authenticated: false });
    return;
  }

  let impersonating: { id: string; email: string; name: string | null } | null = null;
  if (identity.effectiveUserId !== identity.realUserId) {
    const target = await users.getById(identity.effectiveUserId);
    if (target) {
      impersonating = { id: target.id, email: target.email, name: target.name };
    } else {
      // Impersonated user was deleted — drop the impersonation.
      clearImpersonationCookie(res);
    }
  }

  res.json({
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name, pictureUrl: user.picture_url },
    isAdmin: isAdminEmail(user.email),
    ...(impersonating ? { impersonating } : {}),
  });
};

export const requireAuth: RequestHandler = (req, res, next) => {
  const identity = resolveIdentity(req);
  if (!identity) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  req.userId = identity.effectiveUserId;
  req.realUserId = identity.realUserId;
  next();
};
