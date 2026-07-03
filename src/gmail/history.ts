import { gmailClientForAccount } from './client.js';
import type { GmailAccountRow } from '../db/types.js';

export interface NewMessageRef {
  id: string;
}

/**
 * Lists messageAdded history events since startHistoryId, paginating through all pages.
 * Returns the deduped list of new message ids and the response's terminal historyId to
 * store as the new sync watermark.
 */
export async function listHistorySince(
  account: GmailAccountRow,
  startHistoryId: string,
): Promise<{ messages: NewMessageRef[]; newHistoryId: string | null }> {
  const gmail = gmailClientForAccount(account);

  const seen = new Set<string>();
  const messages: NewMessageRef[] = [];
  let pageToken: string | undefined;
  let newHistoryId: string | null = null;

  do {
    const { data } = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
      pageToken,
    });

    for (const record of data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        const id = added.message?.id;
        if (id && !seen.has(id)) {
          seen.add(id);
          messages.push({ id });
        }
      }
    }

    if (data.historyId) newHistoryId = data.historyId;
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return { messages, newHistoryId };
}
