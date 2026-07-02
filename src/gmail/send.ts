import { getGmailClient, getMailboxEmail } from './client.js';
import { buildRawMessage } from './mime.js';

export async function sendEmail(args: { to: string; subject: string; body: string; threadId?: string }): Promise<{ id: string; threadId: string }> {
  const gmail = await getGmailClient();
  const from = await getMailboxEmail();
  const raw = buildRawMessage({ to: args.to, from, subject: args.subject, body: args.body });

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
