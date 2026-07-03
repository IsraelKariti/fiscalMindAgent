import { gmailClientForAccount } from './client.js';
import { buildRawMessage } from './mime.js';
import type { GmailAccountRow } from '../db/types.js';

export async function sendEmail(
  account: GmailAccountRow,
  args: { to: string; subject: string; body: string; threadId?: string },
): Promise<{ id: string; threadId: string }> {
  const gmail = gmailClientForAccount(account);
  const raw = buildRawMessage({ to: args.to, from: account.email_address, subject: args.subject, body: args.body });

  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: args.threadId,
    },
  });

  if (!data.id || !data.threadId) {
    throw new Error(`Gmail send did not return id/threadId: ${JSON.stringify(data)}`);
  }
  return { id: data.id, threadId: data.threadId };
}
