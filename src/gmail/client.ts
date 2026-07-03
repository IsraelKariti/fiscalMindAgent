import { google, type gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import * as gmailAccounts from '../db/queries/gmailAccounts.js';
import type { GmailAccountRow } from '../db/types.js';
import { decryptSecret, encryptSecret } from '../util/crypto.js';
import { logger } from '../util/logger.js';

/**
 * Per-mailbox Gmail clients, authenticated by the refresh token stored
 * (encrypted) in gmail_accounts. All tokens are minted under the one
 * Web-application OAuth client (GOOGLE_OAUTH_CLIENT_ID/SECRET).
 */

function webOAuthCredentials(): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET must be set to use Gmail.');
  }
  return { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET };
}

export function createGmailOAuthClient(redirectUri?: string): OAuth2Client {
  const { clientId, clientSecret } = webOAuthCredentials();
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

// Keyed by account id + token ciphertext, so a re-connect (new refresh token)
// naturally misses the cache and builds a fresh client.
const cache = new Map<string, gmail_v1.Gmail>();

export function gmailClientForAccount(account: GmailAccountRow): gmail_v1.Gmail {
  const cacheKey = `${account.id}:${account.refresh_token_enc}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const oauth = createGmailOAuthClient();
  oauth.setCredentials({ refresh_token: decryptSecret(account.refresh_token_enc) });
  // Google occasionally rotates refresh tokens; persist a replacement if one arrives.
  oauth.on('tokens', (tokens) => {
    if (!tokens.refresh_token) return;
    gmailAccounts
      .upsertForUser({
        userId: account.user_id,
        emailAddress: account.email_address,
        refreshTokenEnc: encryptSecret(tokens.refresh_token),
      })
      .catch((err) => logger.error('failed to persist rotated Gmail refresh token', err, { accountId: account.id }));
  });

  const client = google.gmail({ version: 'v1', auth: oauth });
  cache.set(cacheKey, client);
  return client;
}

export async function getMessage(account: GmailAccountRow, messageId: string): Promise<gmail_v1.Schema$Message> {
  const gmail = gmailClientForAccount(account);
  const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  return data;
}
