import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import * as googleOauthTokens from '../db/queries/googleOauthTokens.js';
import { logger } from '../util/logger.js';

/**
 * Google OAuth for server-side API reads (customer_service agent: Sheets rows
 * + Docs text). Scope is drive.file only — the app can read exactly the files
 * the accountant picked in the Google Picker, nothing else (non-sensitive
 * scope, no Google verification review). Separate from the Google *login*
 * flow (auth.ts), which is identity-only and discards its tokens.
 *
 * Unlike monday tokens, Google access tokens expire (~1h): the stored refresh
 * token is the durable credential and getFreshGoogleAccessToken() refreshes on
 * demand. The popup + signed-state-token mechanics mirror mondayOauth.ts —
 * OAuth cannot run inside the monday iframe, and iframe users have no session
 * cookie to carry through the round trip.
 */

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const STATE_TOKEN_TTL_MS = 10 * 60 * 1000;
/** Refresh when the access token has less than this left — reads must not race expiry. */
const EXPIRY_SLACK_MS = 60 * 1000;

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

function oauthConfigured(): boolean {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${env.APP_BASE_URL}/api/auth/google-drive/callback`;
}

function createOAuthClient(): OAuth2Client {
  return new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri());
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Same signing scheme as the monday connect flow, domain-separated.
function signStatePayload(payload: string): string {
  return crypto
    .createHmac('sha256', `google-drive-oauth:${env.GOOGLE_OAUTH_CLIENT_SECRET ?? ''}`)
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
  if (!env.GOOGLE_OAUTH_CLIENT_SECRET) return null;
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
    ? 'החיבור ל-Google הושלם — אפשר לסגור את החלון. / Google connected — you can close this window.'
    : 'החיבור ל-Google נכשל — סגרו את החלון ונסו שוב. / Connecting to Google failed — close this window and retry.';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>FiscalMind</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#070a14;color:#e8eaf2">
<p style="max-width:32rem;text-align:center;padding:1rem">${message}</p>
<script>try{window.opener&&window.opener.postMessage(${ok ? "'fm-google-connected'" : "'fm-google-connect-failed'"},'*')}catch(e){}window.close()</script>
</body></html>`;
}

/** GET /api/google-connection — the signed-in accountant's Google connection state. */
export const googleConnectionStatus: RequestHandler = async (req, res) => {
  const token = await googleOauthTokens.getByUserId(req.userId!);
  res.json({
    configured: oauthConfigured(),
    connected: token !== null,
    scopes: token?.scopes ?? null,
  });
};

/** GET /api/google-connection/url — where the "Connect Google" popup points. */
export const googleConnectionUrl: RequestHandler = (req, res) => {
  if (!oauthConfigured()) {
    res
      .status(503)
      .json({ error: 'The Google connection is not configured (set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).' });
    return;
  }
  const token = createStateToken(req.userId!);
  res.json({ url: `${env.APP_BASE_URL}/api/auth/google-drive/start?token=${encodeURIComponent(token)}` });
};

/** DELETE /api/google-connection — revoke the grant at Google (best-effort) and forget it. */
export const googleDisconnect: RequestHandler = async (req, res) => {
  const token = await googleOauthTokens.getByUserId(req.userId!);
  if (token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token.refresh_token)}`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      logger.warn('google token revoke failed (deleting anyway)', { reason: String(err) });
    }
  }
  await googleOauthTokens.remove(req.userId!);
  res.json({ ok: true });
};

/** GET /api/auth/google-drive/start?token=… — pre-auth (identity rides the signed token). */
export const startGoogleDriveOauth: RequestHandler = (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  const state = token ? verifyStateToken(token) : null;
  if (!oauthConfigured() || !state) {
    logger.warn('google drive oauth start rejected', { reason: state ? 'not configured' : 'invalid or expired token' });
    res.status(400).send(connectResultPage(false));
    return;
  }
  const url = createOAuthClient().generateAuthUrl({
    scope: [GOOGLE_DRIVE_SCOPE],
    // offline + consent: guarantees a refresh token on every (re-)connect.
    access_type: 'offline',
    prompt: 'consent',
    // The verified token doubles as the OAuth state: it comes back on the
    // callback and is re-verified there, binding the grant to this user.
    state: token!,
  });
  res.redirect(url);
};

/** GET /api/auth/google-drive/callback — code exchange + token storage; closes the popup. */
export const googleDriveOauthCallback: RequestHandler = async (req, res) => {
  const fail = (reason: string): void => {
    logger.warn('google drive oauth callback failed', { reason });
    res.status(400).send(connectResultPage(false));
  };

  const stateParam = typeof req.query.state === 'string' ? req.query.state : null;
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = stateParam ? verifyStateToken(stateParam) : null;
  if (!oauthConfigured()) return fail('not configured');
  if (!state) return fail('invalid or expired state');
  if (!code) return fail(typeof req.query.error === 'string' ? `authorize error: ${req.query.error}` : 'missing code');

  let tokens;
  try {
    ({ tokens } = await createOAuthClient().getToken(code));
  } catch (err) {
    return fail(`token exchange failed: ${String(err)}`);
  }
  if (!tokens.access_token) return fail('token exchange returned no access_token');
  // prompt=consent makes Google issue one every time; its absence means the
  // grant is unusable at webhook time, so store nothing.
  if (!tokens.refresh_token) return fail('token exchange returned no refresh_token');

  await googleOauthTokens.upsert({
    userId: state.userId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 55 * 60 * 1000),
    scopes: tokens.scope ?? GOOGLE_DRIVE_SCOPE,
  });
  logger.info('google drive oauth connected', { userId: state.userId });
  res.send(connectResultPage(true));
};

/**
 * A currently-valid access token for the user, refreshing (and persisting)
 * first when the stored one is expired or about to. Null = never connected.
 * Throws GoogleAuthError when the grant is dead (revoked / refresh rejected).
 */
export async function getFreshGoogleAccessToken(userId: string): Promise<string | null> {
  const row = await googleOauthTokens.getByUserId(userId);
  if (!row) return null;
  if (row.expires_at.getTime() - EXPIRY_SLACK_MS > Date.now()) return row.access_token;

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: row.refresh_token });
  let accessToken: string;
  try {
    const refreshed = await client.getAccessToken();
    if (!refreshed.token) throw new Error('refresh returned no access token');
    accessToken = refreshed.token;
  } catch (err) {
    throw new GoogleAuthError(`Google token refresh failed: ${String(err)}`);
  }
  const expiryDate = client.credentials.expiry_date;
  await googleOauthTokens.updateAccessToken(
    userId,
    accessToken,
    expiryDate ? new Date(expiryDate) : new Date(Date.now() + 55 * 60 * 1000),
  );
  return accessToken;
}

/**
 * GET /api/google-connection/picker — everything the frontend Google Picker
 * needs: a fresh drive.file access token plus the (public) API key and app id.
 * 409 not_connected tells the UI to show the connect button instead.
 */
export const googlePickerConfig: RequestHandler = async (req, res) => {
  if (!env.GOOGLE_PICKER_API_KEY) {
    res.status(503).json({ error: 'The Google Picker is not configured (set GOOGLE_PICKER_API_KEY).' });
    return;
  }
  let accessToken: string | null;
  try {
    accessToken = await getFreshGoogleAccessToken(req.userId!);
  } catch (err) {
    logger.warn('google picker token refresh failed', { reason: String(err) });
    res.status(409).json({ error: 'Google is not connected.', code: 'not_connected' });
    return;
  }
  if (!accessToken) {
    res.status(409).json({ error: 'Google is not connected.', code: 'not_connected' });
    return;
  }
  res.json({ accessToken, apiKey: env.GOOGLE_PICKER_API_KEY, appId: env.GOOGLE_APP_ID ?? null });
};
