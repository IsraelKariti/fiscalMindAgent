import { Queue, Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import * as gmailAccounts from '../db/queries/gmailAccounts.js';
import { startWatchForAccount } from '../gmail/watch.js';
import { logger } from '../util/logger.js';

export const WATCH_RENEWAL_QUEUE_NAME = 'gmail_watch_renewal';

/**
 * Gmail watch() registrations silently expire after 7 days. A daily repeatable
 * job re-registers every connected mailbox — watch() is idempotent, so
 * renewing well before expiry is free, and a mailbox connected between runs
 * is picked up within a day of its first (connect-time) watch expiring.
 */
export async function scheduleWatchRenewal(): Promise<void> {
  const queue = new Queue(WATCH_RENEWAL_QUEUE_NAME, { connection: redisConnection });
  await queue.upsertJobScheduler('renew_all_watches', { pattern: '0 3 * * *' });
  await queue.close();
}

async function renewAllWatches(): Promise<void> {
  const accounts = await gmailAccounts.listAll();
  for (const account of accounts) {
    try {
      const { expiration } = await startWatchForAccount(account);
      logger.info('gmail watch renewed', { mailbox: account.email_address, expiration });
    } catch (err) {
      // One broken mailbox (revoked consent, deleted account) must not block the rest.
      logger.error('gmail watch renewal failed', err, { mailbox: account.email_address });
    }
  }
}

export function createWatchRenewalWorker(): Worker {
  const worker = new Worker(WATCH_RENEWAL_QUEUE_NAME, renewAllWatches, { connection: redisConnection });
  worker.on('failed', (job, err) => logger.error('watch renewal job failed', err, { jobId: job?.id }));
  return worker;
}
