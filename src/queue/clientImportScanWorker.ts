import { Queue, Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { runClientImportScan } from '../agents/shared/clientImportScan.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

export const CLIENT_IMPORT_SCAN_QUEUE_NAME = 'client_import_scan';

export const clientImportScanQueue = new Queue(CLIENT_IMPORT_SCAN_QUEUE_NAME, { connection: redisConnection });

/**
 * Registers (idempotently) the daily client-import sweep at 00:50 local time —
 * after the overdue scan (00:10) and debt scan (00:30) slots, all clear of
 * DST-transition edges. Worker-process only.
 */
export async function ensureClientImportScanScheduler(): Promise<void> {
  await clientImportScanQueue.upsertJobScheduler(
    'client-import-scan-daily',
    { pattern: '50 0 * * *', tz: env.ACCOUNTANT_TIMEZONE },
    { name: 'client_import_scan' },
  );
}

export function createClientImportScanWorker(): Worker {
  const worker = new Worker(CLIENT_IMPORT_SCAN_QUEUE_NAME, () => runClientImportScan(), {
    connection: redisConnection,
    concurrency: 1,
  });
  worker.on('completed', (job) => logger.info('client_import_scan job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('client_import_scan job failed', err, { jobId: job?.id }));
  return worker;
}
