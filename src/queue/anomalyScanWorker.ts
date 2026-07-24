import { Queue, Worker } from 'bullmq';
import { redisConnection } from './connection.js';
import { runAnomalyScan } from '../alerts/anomalyScan.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

export const ANOMALY_SCAN_QUEUE_NAME = 'anomaly_scan';

export const anomalyScanQueue = new Queue(ANOMALY_SCAN_QUEUE_NAME, { connection: redisConnection });

/**
 * Registers (idempotently) the 15-minute anomaly sweep over the audit trail.
 * Every-15-minutes (not daily like the other schedulers) is the detection
 * latency for non-critical anomalies; critical events alert at event time from
 * recordAudit. Worker-process only.
 */
export async function ensureAnomalyScanScheduler(): Promise<void> {
  await anomalyScanQueue.upsertJobScheduler(
    'anomaly-scan-15m',
    { pattern: '*/15 * * * *', tz: env.ACCOUNTANT_TIMEZONE },
    { name: 'anomaly_scan' },
  );
}

export function createAnomalyScanWorker(): Worker {
  // Unlike every other worker, runAnomalyScan is NOT kill-switch-gated:
  // detection is the layer that must survive an incident.
  const worker = new Worker(ANOMALY_SCAN_QUEUE_NAME, () => runAnomalyScan(), {
    connection: redisConnection,
    concurrency: 1,
  });
  worker.on('completed', (job) => logger.info('anomaly_scan job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('anomaly_scan job failed', err, { jobId: job?.id }));
  return worker;
}
