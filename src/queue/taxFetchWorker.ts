import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { TAX_FETCH_QUEUE_NAME, type TaxFetchJob } from './taxFetchQueue.js';
import { expireOrphanedTaxFetchSessions, runTaxFetchJob, wireSessionExpiry } from '../agents/docCollector/taxFetch/runner.js';
import { logger } from '../util/logger.js';

/**
 * Executes tax-authority fetch steps. Concurrency 1: each step drives a real
 * browser and the worker is small; serial keeps memory bounded and avoids two
 * logins racing. The live browser pages live in this process's session manager.
 */
export function createTaxFetchWorker(): Worker<TaxFetchJob> {
  wireSessionExpiry();
  const worker = new Worker<TaxFetchJob>(TAX_FETCH_QUEUE_NAME, (job) => runTaxFetchJob(job.data), {
    connection: redisConnection,
    concurrency: 1,
  });
  worker.on('failed', (job, err) => logger.error('tax_fetch job failed', err, { jobId: job?.id, kind: job?.data.kind }));
  return worker;
}

/** On boot, any session still in a live-browser status was orphaned by the last restart. */
export async function sweepOrphanedTaxFetchSessions(): Promise<void> {
  await expireOrphanedTaxFetchSessions();
}
