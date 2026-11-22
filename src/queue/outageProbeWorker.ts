import { Queue, Worker } from 'bullmq';
import { bullOpts } from './connection.js';
import { acknowledgeHeldClients, probeAllHolds } from '../orchestration/outageRecovery.js';
import { getHoldsFresh } from '../gemini/providerOutage.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

export const OUTAGE_PROBE_QUEUE_NAME = 'outage_probe';

export const outageProbeQueue = new Queue(OUTAGE_PROBE_QUEUE_NAME, { ...bullOpts });

/**
 * Registers (idempotently) the provider outage probe (openspec
 * `llm-provider-outage`): every LLM_OUTAGE_PROBE_SECONDS the worker looks for
 * open holds, probes each held provider, recovers the held work of the ones
 * that answer, and sends the one calm acknowledgement to the clients who
 * wrote during a hold older than LLM_OUTAGE_ACK_AFTER_SECONDS. A tick with
 * no hold is a no-op. Worker-process only.
 */
export async function ensureOutageProbeScheduler(): Promise<void> {
  await outageProbeQueue.upsertJobScheduler('outage-probe', { every: env.LLM_OUTAGE_PROBE_SECONDS * 1000 }, { name: 'outage_probe' });
}

export async function runOutageProbeTick(): Promise<void> {
  const holds = await getHoldsFresh();
  if (Object.keys(holds).length === 0) return;
  const outcomes = await probeAllHolds();
  for (const o of outcomes) {
    if (o.result === 'recovered') logger.info('provider recovered by the probe', { provider: o.provider, ...o.recovered });
  }
  await acknowledgeHeldClients();
}

export function createOutageProbeWorker(): Worker {
  // Like the anomaly scan, NOT kill-switch-gated: the probe is the layer that
  // must keep running during an incident.
  const worker = new Worker(OUTAGE_PROBE_QUEUE_NAME, () => runOutageProbeTick(), { ...bullOpts, concurrency: 1 });
  worker.on('failed', (job, err) => logger.error('outage_probe job failed', err, { jobId: job?.id }));
  return worker;
}
