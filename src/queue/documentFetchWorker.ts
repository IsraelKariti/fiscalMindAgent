import { Worker } from 'bullmq';
import { bullOpts } from './connection.js';
import { DOCUMENT_FETCH_QUEUE_NAME, type DocumentFetchJob } from './documentFetchQueue.js';
import { expireOrphanedDocumentFetchSessions, runDocumentFetchJob, wireSessionExpiry } from '../agents/declarationOfCapital/documentFetch/runner.js';
import { sweepOrphanedSessionContainers } from '../agents/declarationOfCapital/documentFetch/aciSessionPool.js';
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
export function createDocumentFetchWorker(): Worker<DocumentFetchJob> {
  wireSessionExpiry();
  const worker = new Worker<DocumentFetchJob>(DOCUMENT_FETCH_QUEUE_NAME, (job) => runDocumentFetchJob(job.data), {
    ...bullOpts,
    concurrency: env.DOCUMENT_FETCH_RUNNER_MODE === 'aci' ? 8 : 1,
  });
  worker.on('failed', (job, err) => logger.error('document_fetch job failed', err, { jobId: job?.id, kind: job?.data.kind }));
  if (env.DOCUMENT_FETCH_RUNNER_MODE === 'aci') {
    setInterval(() => {
      sweepOrphanedSessionContainers().catch((err) => logger.error('document fetch: container sweep failed', err));
    }, CONTAINER_SWEEP_INTERVAL_MS).unref();
  }
  return worker;
}

/** On boot, any session still in a live-browser status was orphaned by the last restart. */
export async function sweepOrphanedDocumentFetchSessions(): Promise<void> {
  await expireOrphanedDocumentFetchSessions();
  // ACI mode: also reap containers left behind by a crash between jobs.
  await sweepOrphanedSessionContainers();
}
