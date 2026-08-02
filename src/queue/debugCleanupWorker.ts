import { Queue, Worker } from 'bullmq';
import { bullOpts } from './connection.js';
import { cleanupExpiredFailureShots } from '../agents/docCollector/taxFetch/failureShots.js';
import { isKillSwitchOn } from '../agents/killSwitch.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

export const DEBUG_CLEANUP_QUEUE_NAME = 'debug_cleanup';

export const debugCleanupQueue = new Queue(DEBUG_CLEANUP_QUEUE_NAME, { ...bullOpts });

/**
 * Registers (idempotently) the daily sweep that deletes expired failure
 * screenshots (debug/taxfetch/ blobs past TAX_FETCH_DEBUG_RETENTION_DAYS).
 * 03:20 local — off-hours, clear of the 00:10/00:50 business scans.
 */
export async function ensureDebugCleanupScheduler(): Promise<void> {
  await debugCleanupQueue.upsertJobScheduler(
    'debug-cleanup-daily',
    { pattern: '20 3 * * *', tz: env.ACCOUNTANT_TIMEZONE },
    { name: 'debug_cleanup' },
  );
}

export function createDebugCleanupWorker(): Worker {
  const worker = new Worker(
    DEBUG_CLEANUP_QUEUE_NAME,
    async () => {
      // Kill switch on = incident in progress; failure evidence is exactly what
      // must NOT be deleted then. The sweep catches up on the next quiet day.
      if (await isKillSwitchOn()) {
        logger.warn('debug_cleanup skipped: platform kill switch is on');
        return;
      }
      await cleanupExpiredFailureShots();
    },
    { ...bullOpts, concurrency: 1 },
  );
  worker.on('completed', (job) => logger.info('debug_cleanup job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('debug_cleanup job failed', err, { jobId: job?.id }));
  return worker;
}
