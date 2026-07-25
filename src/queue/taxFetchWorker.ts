import { Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { TAX_FETCH_QUEUE_NAME, type TaxFetchJob } from './taxFetchQueue.js';
import { expireOrphanedTaxFetchSessions, runTaxFetchJob, wireSessionExpiry } from '../agents/docCollector/taxFetch/runner.js';
import { sweepOrphanedSessionContainers } from '../agents/docCollector/taxFetch/aciSessionPool.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

const CONTAINER_SWEEP_INTERVAL_MS = 15 * 60_000;

/**
 * Executes tax-authority fetch steps. Static mode runs at concurrency 1: each
 * step drives a real Chrome on the one small runner, so serial keeps memory
 * bounded and avoids two logins racing. ACI mode runs concurrent: every
 * session has its own container and the jobs here are just HTTP orchestration,
 * so serializing would only queue clients behind each other's provisioning.
 */
export function createTaxFetchWorker(): Worker<TaxFetchJob> {
  wireSessionExpiry();
  const worker = new Worker<TaxFetchJob>(TAX_FETCH_QUEUE_NAME, (job) => runTaxFetchJob(job.data), {
    connection: redisConnection,
    concurrency: env.TAX_FETCH_RUNNER_MODE === 'aci' ? 8 : 1,
  });
  worker.on('failed', (job, err) => logger.error('tax_fetch job failed', err, { jobId: job?.id, kind: job?.data.kind }));
  if (env.TAX_FETCH_RUNNER_MODE === 'aci') {
    setInterval(() => {
      sweepOrphanedSessionContainers().catch((err) => logger.error('tax fetch: container sweep failed', err));
    }, CONTAINER_SWEEP_INTERVAL_MS).unref();
  }
  return worker;
}

/** On boot, any session still in a live-browser status was orphaned by the last restart. */
export async function sweepOrphanedTaxFetchSessions(): Promise<void> {
  await expireOrphanedTaxFetchSessions();
  // ACI mode: also reap containers left behind by a crash between jobs.
  await sweepOrphanedSessionContainers();
}
