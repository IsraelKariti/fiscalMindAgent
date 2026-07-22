import crypto from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import * as mondayAccounts from '../db/queries/mondayAccounts.js';
import * as users from '../db/queries/users.js';
import * as whitelist from '../db/queries/whitelist.js';
import { logger } from '../util/logger.js';
import { consumeMondayHandoffToken, verifyMondayLinkToken } from './mondayAuth.js';

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

/**
 * Origin to send the browser back to after the OAuth round-trip. In dev the
 * dashboard is the Vite server on GUI_PORT while the callback lands on this
 * backend (PORT), so we capture the origin login started from and finish
 * there. Only localhost origins are honored — anything else falls back to a
 * same-origin redirect — so this cannot become an open redirect in production.
 */
function loginReturnOrigin(req: Request): string {
  const referer = req.headers.referer;
  if (!referer) return '';
  try {
    const url = new URL(referer);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return '';
    if (url.origin === env.APP_BASE_URL) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/**
 * Sets a short-lived signed CSRF state cookie (state + return origin) for an
 * OAuth redirect flow. `mondayLink` carries a monday link token (see
 * mondayAuth.ts) when the login was opened from the widget's "link existing
 * account" popup.
 */
export function setOAuthStateCookie(res: Response, state: string, returnTo = '', mondayLink = ''): void {
  const payload = Buffer.from(JSON.stringify({ state, returnTo, mondayLink })).toString('base64url');
  res.cookie(STATE_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_BASE_URL.startsWith('https://'),
    maxAge: STATE_TTL_MS,
    path: '/',
  });
}

/** Reads + clears the state cookie; returns its contents only if the signature checks out. */
export function consumeOAuthStateCookie(
  req: Request,
  res: Response,
): { state: string; returnTo: string; mondayLink: string } | null {
  const cookie = readCookie(req, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, { path: '/' });
  if (!cookie) return null;
  const [value, signature] = cookie.split('.');
  if (!value || !signature || !timingSafeEqual(signature, sign(value))) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { state?: unknown }).state !== 'string' ||
      typeof (parsed as { returnTo?: unknown }).returnTo !== 'string'
    ) {
      return null;
    }
    const { state, returnTo, mondayLink } = parsed as { state: string; returnTo: string; mondayLink?: unknown };
    return { state, returnTo, mondayLink: typeof mondayLink === 'string' ? mondayLink : '' };
  } catch {
    return null;
  }
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
export const startGoogleLogin: RequestHandler = (req, res) => {
  let oauth: OAuth2Client;
  try {
    oauth = createLoginOAuthClient();
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  const mondayLink = typeof req.query.monday_link === 'string' ? req.query.monday_link : '';
  setOAuthStateCookie(res, state, loginReturnOrigin(req), mondayLink);
  res.redirect(oauth.generateAuthUrl({ scope: IDENTITY_SCOPES, state, prompt: 'select_account' }));
};

/** Bare-bones closing page for the monday "link account" popup (no SPA involved). */
function mondayLinkResultPage(ok: boolean): string {
  const message = ok
    ? 'החשבון קושר בהצלחה — אפשר לסגור את החלון ולחזור ל-monday. / Account linked — you can close this window and return to monday.'
    : 'קישור החשבון נכשל — סגרו את החלון ונסו שוב מהווידג׳ט. / Linking failed — close this window and retry from the widget.';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>FiscalMind</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#070a14;color:#e8eaf2">
<p style="max-width:32rem;text-align:center;padding:1rem">${message}</p></body></html>`;
}

/** GET /api/auth/google/callback — code exchange, user upsert, session issue. */
export const googleLoginCallback: RequestHandler = async (req, res) => {
  const stateCookie = consumeOAuthStateCookie(req, res);
  const returnTo = stateCookie?.returnTo ?? '';

  const fail = (reason: string): void => {
    logger.warn('google login failed', { reason });
    res.redirect(`${returnTo}/?login_error=${encodeURIComponent(reason)}`);
  };

  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code || !state || !stateCookie) return fail('missing code or state');
  if (state !== stateCookie.state) return fail('state mismatch');

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

  // Login opened from the monday widget's "link existing account" popup:
  // point the monday identity at this (Google-verified) user and show a
  // plain closing page instead of entering the SPA.
  if (stateCookie.mondayLink) {
    const link = verifyMondayLinkToken(stateCookie.mondayLink);
    if (!link) {
      logger.warn('monday account link failed', { reason: 'invalid or expired link token' });
      res.status(400).send(mondayLinkResultPage(false));
      return;
    }
    await mondayAccounts.upsert({
      mondayAccountId: link.accountId,
      mondayUserId: link.userId,
      userId: user.id,
      mondayEmail: user.email,
    });
    res.send(mondayLinkResultPage(true));
    return;
  }

  res.redirect(`${returnTo}/`);
};

/**
 * GET /api/auth/monday-handoff?token=… — redeem a single-use handoff token
 * (issued by GET /api/monday/app-login-url to an authenticated monday user)
 * for a regular session cookie. This is how monday-only accounts, which have
 * no Google login, enter the standalone app from "Open in FiscalMind".
 */
export const mondayHandoff: RequestHandler = async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  const handoff = token ? consumeMondayHandoffToken(token) : null;
  const user = handoff ? await users.getById(handoff.userId) : null;
  if (!user) {
    logger.warn('monday handoff failed', { reason: handoff ? 'unknown user' : 'invalid, expired, or reused token' });
    res.redirect('/?login_error=monday_handoff_failed');
    return;
  }
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

  const isAdmin = isAdminEmail(user.email);
  // Tier of the workspace being viewed — the impersonated accountant's while
  // impersonating, null for admins (they are not accountants).
  const tier = await whitelist.getTier(impersonating?.email ?? user.email);
  res.json({
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name, pictureUrl: user.picture_url },
    isAdmin,
    whitelisted: isAdmin || (await whitelist.isWhitelisted(user.email)),
    tier,
    // Where "Upgrade to Premium" points until self-serve billing exists.
    contactEmail: env.ADMIN_EMAILS[0] ?? null,
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

/**
 * Paid-access gate, keyed on the REAL signed-in user: admins always pass (which
 * also covers impersonating a not-yet-whitelisted accountant); everyone else
 * needs their email in whitelisted_emails. Runs after requireAuth.
 */
export const requireWhitelisted: RequestHandler = async (req, res, next) => {
  try {
    const user = await users.getById(req.realUserId!);
    if (user && (isAdminEmail(user.email) || (await whitelist.isWhitelisted(user.email)))) {
      next();
      return;
    }
    res.status(403).json({ error: 'This account is not activated. Contact the administrator for access.' });
  } catch (err) {
    next(err);
  }
};
