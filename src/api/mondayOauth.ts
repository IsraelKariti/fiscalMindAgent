import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import * as mondayOauthTokens from '../db/queries/mondayOauthTokens.js';
import { logger } from '../util/logger.js';

/**
 * monday.com OAuth for server-side API reads (customer_service agent: workdocs
 * + board rows). Unlike the widget's seamless sessionToken auth, this stores a
 * long-lived per-accountant access token so agents can query monday at webhook
 * time, with no browser involved.
 *
 * Flow: the SPA / monday iframe opens GET /api/auth/monday/start?token=… in a
 * top-level popup (OAuth cannot run inside the iframe); the signed short-lived
 * token carries the fiscalMind user through the round trip — a state cookie
 * would not survive it for monday-iframe users, who have no session cookie.
 */

/** Scopes the agents need; must also be enabled on the monday app in the Developer Center. */
const MONDAY_OAUTH_SCOPES = 'boards:read docs:read';
const STATE_TOKEN_TTL_MS = 10 * 60 * 1000;

function oauthConfigured(): boolean {
  return Boolean(env.MONDAY_CLIENT_ID && env.MONDAY_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${env.APP_BASE_URL}/api/auth/monday/callback`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Same signing scheme as the link/handoff tokens in mondayAuth.ts, domain-separated.
function signStatePayload(payload: string): string {
  return crypto
    .createHmac('sha256', `monday-oauth:${env.MONDAY_CLIENT_SECRET ?? ''}`)
    .update(payload)
    .digest('base64url');
}

function createStateToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, exp: Date.now() + STATE_TOKEN_TTL_MS })).toString(
    'base64url',
  );
  return `${payload}.${signStatePayload(payload)}`;
}

function verifyStateToken(token: string): { userId: string } | null {
  if (!env.MONDAY_CLIENT_SECRET) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !timingSafeEqual(signature, signStatePayload(payload))) return null;
  let parsed: { u?: string; exp?: number } | null;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { u?: string; exp?: number };
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.u !== 'string') return null;
  if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
  return { userId: parsed.u };
}

/**
 * Bare-bones closing page for the connect popup. The postMessage lets the
 * opener refresh immediately; openers also poll the status endpoint while the
 * popup is open, in case the message is lost.
 */
function connectResultPage(ok: boolean): string {
  const message = ok
    ? 'החיבור ל-monday הושלם — אפשר לסגור את החלון. / monday connected — you can close this window.'
    : 'החיבור ל-monday נכשל — סגרו את החלון ונסו שוב. / Connecting to monday failed — close this window and retry.';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>FiscalMind</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#070a14;color:#e8eaf2">
<p style="max-width:32rem;text-align:center;padding:1rem">${message}</p>
<script>try{window.opener&&window.opener.postMessage(${ok ? "'fm-monday-connected'" : "'fm-monday-connect-failed'"},'*')}catch(e){}window.close()</script>
</body></html>`;
}

/** GET /api/monday-connection — the signed-in accountant's monday connection state. */
export const mondayConnectionStatus: RequestHandler = async (req, res) => {
  const token = await mondayOauthTokens.getByUserId(req.userId!);
  res.json({
    configured: oauthConfigured(),
    connected: token !== null,
    scopes: token?.scopes ?? null,
  });
};

/** GET /api/monday-connection/url — where the "Connect monday" popup points. */
export const mondayConnectionUrl: RequestHandler = (req, res) => {
  if (!oauthConfigured()) {
    res.status(503).json({ error: 'The monday connection is not configured (set MONDAY_CLIENT_ID / MONDAY_CLIENT_SECRET).' });
    return;
  }
  const token = createStateToken(req.userId!);
  res.json({ url: `${env.APP_BASE_URL}/api/auth/monday/start?token=${encodeURIComponent(token)}` });
};

/** DELETE /api/monday-connection — forget the stored token (monday has no revocation endpoint). */
export const mondayDisconnect: RequestHandler = async (req, res) => {
  await mondayOauthTokens.remove(req.userId!);
  res.json({ ok: true });
};

/** GET /api/auth/monday/start?token=… — pre-auth (identity rides the signed token). */
export const startMondayOauth: RequestHandler = (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  const state = token ? verifyStateToken(token) : null;
  if (!oauthConfigured() || !state) {
    logger.warn('monday oauth start rejected', { reason: state ? 'not configured' : 'invalid or expired token' });
    res.status(400).send(connectResultPage(false));
    return;
  }
  const url = new URL('https://auth.monday.com/oauth2/authorize');
  url.searchParams.set('client_id', env.MONDAY_CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('scope', MONDAY_OAUTH_SCOPES);
  // The verified token doubles as the OAuth state: it comes back on the
  // callback and is re-verified there, binding the grant to this user.
  url.searchParams.set('state', token!);
  res.redirect(url.toString());
};

/** GET /api/auth/monday/callback — code exchange + token storage; closes the popup. */
export const mondayOauthCallback: RequestHandler = async (req, res) => {
  const fail = (reason: string): void => {
    logger.warn('monday oauth callback failed', { reason });
    res.status(400).send(connectResultPage(false));
  };

  const stateParam = typeof req.query.state === 'string' ? req.query.state : null;
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = stateParam ? verifyStateToken(stateParam) : null;
  if (!oauthConfigured()) return fail('not configured');
  if (!state) return fail('invalid or expired state');
  if (!code) return fail(typeof req.query.error === 'string' ? `authorize error: ${req.query.error}` : 'missing code');

  const response = await fetch('https://auth.monday.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.MONDAY_CLIENT_ID,
      client_secret: env.MONDAY_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!response.ok) return fail(`token exchange failed: HTTP ${response.status}`);
  const body = (await response.json()) as { access_token?: string; scope?: string };
  if (!body.access_token) return fail('token exchange returned no access_token');

  await mondayOauthTokens.upsert({
    userId: state.userId,
    accessToken: body.access_token,
    scopes: body.scope ?? MONDAY_OAUTH_SCOPES,
    mondayAccountId: null,
  });
  logger.info('monday oauth connected', { userId: state.userId });
  res.send(connectResultPage(true));
};
