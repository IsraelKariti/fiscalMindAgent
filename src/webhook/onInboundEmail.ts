import * as gmailSyncState from '../db/queries/gmailSyncState.js';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import { withClientLock } from '../db/withClientLock.js';
import { listHistorySince } from '../gmail/history.js';
import { getMessage } from '../gmail/client.js';
import { extractHeader, extractPlainTextBody, parseEmailAddress } from '../gmail/mime.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { logger } from '../util/logger.js';

export interface GmailPushPayload {
  emailAddress: string;
  historyId: number;
}

export async function onInboundEmail(payload: GmailPushPayload, pubsubMessageId: string): Promise<void> {
  const mailbox = payload.emailAddress;
  const syncState = await gmailSyncState.get(mailbox);
  if (!syncState) {
    logger.warn('no sync state for mailbox, ignoring (was watch() run?)', { mailbox });
    return;
  }

  if (BigInt(payload.historyId) <= BigInt(syncState.last_history_id)) {
    logger.debug('stale/duplicate history notification, skipping', {
      mailbox,
      notified: payload.historyId,
      stored: syncState.last_history_id,
      pubsubMessageId,
    });
    return;
  }

  const { messages, newHistoryId } = await listHistorySince(mailbox, syncState.last_history_id);

  if (messages.length === 0) {
    await gmailSyncState.updateHistoryId(mailbox, newHistoryId ?? String(payload.historyId));
    return;
  }

  for (const msg of messages) {
    const full = await getMessage(msg.id);
    const fromAddress = parseEmailAddress(extractHeader(full, 'From'));
    if (fromAddress === mailbox) continue; // our own sent mail surfacing in history

    const client = await clients.getByEmailAddress(fromAddress);
    if (!client) {
      logger.warn('inbound message from unknown address, ignoring', { fromAddress });
      continue;
    }

    const threadId = full.threadId;
    if (!threadId) {
      logger.warn('inbound message missing threadId, skipping', { messageId: msg.id });
      continue;
    }

    const inserted = await emails.insertInboundIfNew(client.id, {
      gmailMessageId: msg.id,
      gmailThreadId: threadId,
      subject: extractHeader(full, 'Subject'),
      body: extractPlainTextBody(full),
      sentAt: new Date(Number(full.internalDate)),
    });

    if (inserted) {
      await withClientLock(client.id, async () => {
        await removeFutureEmail(client.id);
        await setFutureEmail(client.id);
      });
    }
  }

  await gmailSyncState.updateHistoryId(mailbox, newHistoryId ?? String(payload.historyId));
}
