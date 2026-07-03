import { gmailClientForAccount } from './client.js';
import { env } from '../config/env.js';
import * as gmailSyncState from '../db/queries/gmailSyncState.js';
import type { GmailAccountRow } from '../db/types.js';

export async function startWatchForAccount(
  account: GmailAccountRow,
): Promise<{ mailbox: string; historyId: string; expiration: Date | null }> {
  const gmail = gmailClientForAccount(account);

  const { data } = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: env.GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX'],
      labelFilterAction: 'include',
    },
  });

  if (!data.historyId) throw new Error(`Gmail watch() did not return historyId: ${JSON.stringify(data)}`);
  const expiration = data.expiration ? new Date(Number(data.expiration)) : null;

  await gmailSyncState.seed(account.email_address, data.historyId, expiration);

  return { mailbox: account.email_address, historyId: data.historyId, expiration };
}

/** Stops push notifications for a mailbox (used when disconnecting it). */
export async function stopWatchForAccount(account: GmailAccountRow): Promise<void> {
  const gmail = gmailClientForAccount(account);
  await gmail.users.stop({ userId: 'me' });
}
