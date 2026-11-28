import { Queue, Worker } from 'bullmq';
import { bullOpts } from './connection.js';
import { runOverdueScan } from '../agents/declarationOfCapital/overdueScan.js';
import { runHandoffNoticeScan } from '../agents/declarationOfCapital/handoffNoticeSend.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

export const OVERDUE_SCAN_QUEUE_NAME = 'overdue_scan';

export const overdueScanQueue = new Queue(OVERDUE_SCAN_QUEUE_NAME, { ...bullOpts });

/** Job name of the 09:00 handoff-notice run; every other job on the queue is the overdue scan. */
export const HANDOFF_NOTICE_JOB_NAME = 'handoff_notice';

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

/**
 * Registers (idempotently) the daily 09:00 local run that tells clients the
 * agent stopped the night before (openspec `handoff-notice`). The run itself
 * skips non-business days. Not run at worker boot: a boot in the afternoon
 * would send outside the morning, and the next daily run covers a missed one.
 */
export async function ensureHandoffNoticeScheduler(): Promise<void> {
  await overdueScanQueue.upsertJobScheduler(
    'handoff-notice-daily',
    { pattern: '0 9 * * *', tz: env.ACCOUNTANT_TIMEZONE },
    { name: HANDOFF_NOTICE_JOB_NAME },
  );
}

/** Which scan a job of the queue runs, by its name. */
export function overdueQueueJobKind(jobName: string): 'handoff_notice' | 'overdue_scan' {
  return jobName === HANDOFF_NOTICE_JOB_NAME ? 'handoff_notice' : 'overdue_scan';
}

export function createOverdueScanWorker(): Worker {
  const worker = new Worker(
    OVERDUE_SCAN_QUEUE_NAME,
    async (job) => {
      if (overdueQueueJobKind(job.name) === 'handoff_notice') await runHandoffNoticeScan();
      else await runOverdueScan();
    },
    { ...bullOpts, concurrency: 1 },
  );
  worker.on('completed', (job) => logger.info('overdue_scan job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('overdue_scan job failed', err, { jobId: job?.id }));
  return worker;
}
