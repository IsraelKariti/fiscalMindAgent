import { getGmailClient, getMailboxEmail } from './client.js';
import { env } from '../config/env.js';
import * as gmailSyncState from '../db/queries/gmailSyncState.js';

export async function startWatch(): Promise<{ mailbox: string; historyId: string; expiration: Date | null }> {
  const gmail = await getGmailClient();
  const mailbox = await getMailboxEmail();

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

  await gmailSyncState.seed(mailbox, data.historyId, expiration);

  return { mailbox, historyId: data.historyId, expiration };
}
