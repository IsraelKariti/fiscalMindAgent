import { Queue, Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { runOverdueScan } from '../agents/docCollector/overdueScan.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

export const OVERDUE_SCAN_QUEUE_NAME = 'overdue_scan';

export const overdueScanQueue = new Queue(OVERDUE_SCAN_QUEUE_NAME, { connection: redisConnection });

/**
 * Registers (idempotently) the daily scan at 00:10 local time — so "the due
 * date passed" means the due day ended in the accountant's timezone; :10
 * rather than :00 dodges DST-transition edges. Worker-process only.
 */
export async function ensureOverdueScanScheduler(): Promise<void> {
  await overdueScanQueue.upsertJobScheduler(
    'overdue-scan-daily',
    { pattern: '10 0 * * *', tz: env.ACCOUNTANT_TIMEZONE },
    { name: 'overdue_scan' },
  );
}

export function createOverdueScanWorker(): Worker {
  const worker = new Worker(OVERDUE_SCAN_QUEUE_NAME, () => runOverdueScan(), {
    connection: redisConnection,
    concurrency: 1,
  });
  worker.on('completed', (job) => logger.info('overdue_scan job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('overdue_scan job failed', err, { jobId: job?.id }));
  return worker;
}
