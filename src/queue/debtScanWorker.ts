import { Queue, Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { runDebtScan } from '../agents/debtCollector/dailyScan.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

export const DEBT_SCAN_QUEUE_NAME = 'debt_scan';

export const debtScanQueue = new Queue(DEBT_SCAN_QUEUE_NAME, { connection: redisConnection });

/**
 * Registers (idempotently) the daily debtor sweep at 00:30 local time —
 * after the overdue scan's 00:10 slot, both clear of DST-transition edges.
 * Worker-process only.
 */
export async function ensureDebtScanScheduler(): Promise<void> {
  await debtScanQueue.upsertJobScheduler(
    'debt-scan-daily',
    { pattern: '30 0 * * *', tz: env.ACCOUNTANT_TIMEZONE },
    { name: 'debt_scan' },
  );
}

export function createDebtScanWorker(): Worker {
  const worker = new Worker(DEBT_SCAN_QUEUE_NAME, () => runDebtScan(), {
    connection: redisConnection,
    concurrency: 1,
  });
  worker.on('completed', (job) => logger.info('debt_scan job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('debt_scan job failed', err, { jobId: job?.id }));
  return worker;
}
