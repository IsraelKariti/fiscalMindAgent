import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { google, type gmail_v1 } from 'googleapis';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

let cachedClient: gmail_v1.Gmail | null = null;
let cachedOAuth2Client: OAuth2Client | null = null;

export function createOAuth2Client(): OAuth2Client {
  return new OAuth2Client(env.GMAIL_OAUTH_CLIENT_ID, env.GMAIL_OAUTH_CLIENT_SECRET, 'http://localhost:5555/oauth2callback');
}

async function loadStoredTokens(oauth2Client: OAuth2Client): Promise<void> {
  const raw = await readFile(env.GMAIL_TOKEN_PATH, 'utf8').catch(() => null);
  if (!raw) {
    throw new Error(`No Gmail OAuth token found at ${env.GMAIL_TOKEN_PATH}. Run "npm run gmail:auth" first.`);
  }
  oauth2Client.setCredentials(JSON.parse(raw));
  oauth2Client.on('tokens', (tokens) => {
    persistTokens(oauth2Client, tokens).catch((err) => logger.error('failed to persist refreshed Gmail tokens', err));
  });
}

async function persistTokens(oauth2Client: OAuth2Client, newTokens: Credentials): Promise<void> {
  const merged = { ...oauth2Client.credentials, ...newTokens };
  await mkdir(path.dirname(env.GMAIL_TOKEN_PATH), { recursive: true });
  await writeFile(env.GMAIL_TOKEN_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
}

export async function getOAuth2Client(): Promise<OAuth2Client> {
  if (cachedOAuth2Client) return cachedOAuth2Client;
  const client = createOAuth2Client();
  await loadStoredTokens(client);
  cachedOAuth2Client = client;
  return client;
}

export async function getGmailClient(): Promise<gmail_v1.Gmail> {
  if (cachedClient) return cachedClient;
  const auth = await getOAuth2Client();
  cachedClient = google.gmail({ version: 'v1', auth });
  return cachedClient;
}

let cachedMailboxEmail: string | null = null;

export async function getMailboxEmail(): Promise<string> {
  if (cachedMailboxEmail) return cachedMailboxEmail;
  const gmail = await getGmailClient();
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const address = profile.data.emailAddress;
  if (!address) throw new Error('Gmail getProfile did not return emailAddress');
  cachedMailboxEmail = address;
  return address;
}

export async function getMessage(messageId: string): Promise<gmail_v1.Schema$Message> {
  const gmail = await getGmailClient();
  const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  return data;
}
