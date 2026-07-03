import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import * as gmailAccounts from '../db/queries/gmailAccounts.js';
import { createGmailOAuthClient } from '../gmail/client.js';
import { startWatchForAccount, stopWatchForAccount } from '../gmail/watch.js';
import { encryptSecret } from '../util/crypto.js';
import { logger } from '../util/logger.js';
import { consumeOAuthStateCookie, setOAuthStateCookie } from './auth.js';

/**
 * "Connect your Gmail" — the second OAuth consent, separate from sign-in:
 * grants the agent offline gmail.send/gmail.readonly on the mailbox it will
 * act as. `openid email` is included so the callback's id_token names which
 * mailbox was connected without an extra API call.
 */
const GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];

function connectRedirectUri(): string {
  return `${env.APP_BASE_URL}/api/gmail/callback`;
}

/** GET /api/gmail/connect (auth) — start the consent redirect. */
export const startGmailConnect: RequestHandler = (_req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  setOAuthStateCookie(res, state);
  const oauth = createGmailOAuthClient(connectRedirectUri());
  res.redirect(
    oauth.generateAuthUrl({
      scope: GMAIL_SCOPES,
      state,
      access_type: 'offline',
      // Force re-consent so Google always returns a refresh_token, even if
      // this Google account authorized the app before.
      prompt: 'consent',
    }),
  );
};

/** GET /api/gmail/callback (auth) — store the encrypted refresh token, start the watch. */
export const gmailConnectCallback: RequestHandler = async (req, res) => {
  const fail = (reason: string): void => {
    logger.warn('gmail connect failed', { reason, userId: req.userId });
    res.redirect(`/?gmail_error=${encodeURIComponent(reason)}`);
  };

  const expectedState = consumeOAuthStateCookie(req, res);
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code || !state || !expectedState) return fail('missing code or state');
  if (state !== expectedState) return fail('state mismatch');

  const oauth = createGmailOAuthClient(connectRedirectUri());
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) return fail('no refresh_token returned');
  if (!tokens.id_token) return fail('no id_token returned');

  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_OAUTH_CLIENT_ID });
  const mailbox = ticket.getPayload()?.email;
  if (!mailbox) return fail('id_token missing email');

  const account = await gmailAccounts.upsertForUser({
    userId: req.userId!,
    emailAddress: mailbox,
    refreshTokenEnc: encryptSecret(tokens.refresh_token),
  });

  try {
    const watch = await startWatchForAccount(account);
    logger.info('gmail connected', { userId: req.userId, mailbox, watchExpiration: watch.expiration });
  } catch (err) {
    // Token is stored; sends will work. Inbound needs the watch — surface it.
    logger.error('gmail connected but watch() failed', err, { userId: req.userId, mailbox });
    return fail('connected but starting notifications failed; try reconnecting');
  }

  res.redirect('/');
};

/** GET /api/gmail/status (auth) — which mailbox this user has connected, if any. */
export const gmailStatus: RequestHandler = async (req, res) => {
  const account = await gmailAccounts.getByUserId(req.userId!);
  res.json({ connected: !!account, emailAddress: account?.email_address ?? null });
};

/** POST /api/gmail/disconnect (auth) — stop notifications and drop the token. */
export const gmailDisconnect: RequestHandler = async (req, res) => {
  const account = await gmailAccounts.getByUserId(req.userId!);
  if (account) {
    await stopWatchForAccount(account).catch((err) =>
      logger.warn('users.stop failed during disconnect (continuing)', { err: (err as Error).message }),
    );
    await gmailAccounts.removeForUser(req.userId!);
  }
  res.json({ ok: true });
};
