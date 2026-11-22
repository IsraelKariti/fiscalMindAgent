import { DelayedError, Worker, type Job } from 'bullmq';
import { bullOpts } from './connection.js';
import { REPLAN_QUEUE_NAME, replanQueue } from './replanQueue.js';
import * as clients from '../db/queries/clients.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import * as emails from '../db/queries/emails.js';
import { plannerHeld } from '../orchestration/outageRecovery.js';
import { withClientLock } from '../db/withClientLock.js';
import { isKillSwitchOn } from '../agents/killSwitch.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { turnStore } from '../orchestration/inboundTurn.js';
import { replanJobId, replanKindOf, replanTriggerOf, type ReplanJobData } from '../orchestration/inboundTurnCore.js';
import { decideReplan } from '../orchestration/inboundTurnRules.js';
import { requestReplan, requestReplanAfterSend } from '../orchestration/requestReplan.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

/** How soon the job looks again while the turn is not settled. */
const RECHECK_MS = 2_000;
/** Boot recovery only picks up waits this recent — an older drafting stamp is an abandoned attempt, left to the manual retry. */
const RECOVERY_WINDOW_SECONDS = 3600;

/** Puts the running job back into the delayed set; BullMQ's way to say "not yet" from inside a processor. */
async function runAgainIn(job: Job<ReplanJobData>, token: string | undefined, ms: number): Promise<never> {
  await job.moveToDelayed(Date.now() + ms, token);
  throw new DelayedError();
}

/**
 * The deferred planner run of a client's turn (openspec `inbound-turn`). Fires
 * after the quiet window; plans only once no inbound processing is in flight,
 * the client has been quiet for the whole window and no file waits for
 * analysis — otherwise it looks again shortly, up to the maximum wait.
 */
async function onReplan(job: Job<ReplanJobData>, token?: string): Promise<void> {
  const { clientId } = job.data;
  const turnStartedAt = new Date(job.data.turnStartedAt);
  const limits = { quietMs: env.INBOUND_QUIET_SECONDS * 1000, maxWaitMs: env.INBOUND_MAX_WAIT_SECONDS * 1000 };

  const [{ inflight, lastInboundAt }, pendingFiles, heldFiles, heldMessages, providerHeld] = await Promise.all([
    turnStore.read(clientId),
    documentFiles.countRecentPendingForClient(clientId, env.INBOUND_MAX_WAIT_SECONDS),
    documentFiles.countOutageHeldForClient(clientId),
    emails.countScreenPendingForClient(clientId),
    plannerHeld(),
  ]);
  // A provider outage hold (openspec `llm-provider-outage`): the turn waits
  // for the recovery, re-checking at the probe's pace instead of every 2 s.
  const held = providerHeld || heldFiles > 0 || heldMessages > 0;
  const decision = decideReplan({ inflight, lastInboundAt, pendingFiles, held }, turnStartedAt, new Date(), limits);
  if (decision === 'wait') {
    // Keeps the workspace's "drafting…" placeholder from going stale during a long turn.
    await clients.markDraftingStarted(clientId);
    await runAgainIn(job, token, held ? env.LLM_OUTAGE_PROBE_SECONDS * 1000 : RECHECK_MS);
  }
  if (decision === 'force') {
    logger.warn('inbound turn not settled after the maximum wait — planning with what is finished', {
      clientId,
      inflight,
      pendingFiles,
      lastInboundAt: lastInboundAt?.toISOString() ?? null,
      turnStartedAt: turnStartedAt.toISOString(),
    });
  }

  if (await isKillSwitchOn()) {
    logger.warn('platform kill switch on, skipping the deferred re-plan', { clientId });
    await clients.clearDraftingState(clientId);
    publishClientUpdated(clientId);
    return;
  }

  // From here on a new inbound leaves the dirty flag instead of moving this job.
  await turnStore.clearDirty(clientId);
  // A reply (or backfilled files) always obsoletes the pending send; the
  // re-plan drafts the next one. Locked so a concurrent worker send and this
  // re-plan can't interleave.
  // An after-send run (openspec `after-send-plan-delay`) names the delivered
  // message as the trigger of the draft it writes; a turn names the reply.
  const trigger = replanTriggerOf(job.data);
  await withClientLock(clientId, async () => {
    await removeFutureEmail(clientId, replanKindOf(job.data) === 'turn' ? 'client_message' : 'send_settled');
    await setFutureEmail(clientId, trigger);
  });
  // setFutureEmail returns early for a complete or paused client without
  // touching the stamp the webhook set.
  await clients.clearDraftingState(clientId);
  publishClientUpdated(clientId);

  if (await turnStore.takeDirty(clientId)) {
    // The client wrote again while the planner ran: a new turn, planned by this same job.
    logger.info('inbound arrived during the re-plan, planning again after the quiet window', { clientId });
    await job.updateData({ clientId, turnStartedAt: Date.now(), kind: 'turn', trigger: 'client_message' });
    await clients.markDraftingStarted(clientId);
    await runAgainIn(job, token, limits.quietMs);
  }
}

export function createReplanWorker(): Worker<ReplanJobData> {
  // The planner call is slow and per client; clients do not block each other.
  const worker = new Worker<ReplanJobData>(REPLAN_QUEUE_NAME, onReplan, { ...bullOpts, concurrency: 5 });
  worker.on('completed', (job) => logger.info('replan job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('replan job failed', err, { jobId: job?.id }));
  return worker;
}

/**
 * Redis is treated as disposable: a turn that was waiting when its job was
 * lost (restart, eviction) is visible in Postgres as a recent drafting stamp
 * with nothing scheduled. Ask for its re-plan again on worker boot. The same
 * for an after-send wait (openspec `after-send-plan-delay`): a client whose
 * last outbound was delivered and that has nothing planned gets its wait back,
 * for the time that is left.
 */
export async function recoverLostReplans(): Promise<void> {
  const clientIds = await clients.listDraftingWithoutSchedule(RECOVERY_WINDOW_SECONDS);
  let recovered = 0;
  for (const clientId of clientIds) {
    if (await replanQueue.getJob(replanJobId(clientId))) continue;
    await requestReplan(clientId);
    recovered += 1;
  }
  if (recovered > 0) logger.info('re-requested lost deferred re-plans', { recovered });

  // A client held by a provider outage (openspec `llm-provider-outage`) keeps
  // its marker across restarts; its turn is re-requested whatever its age —
  // the job then waits while the hold is open and plans after the recovery.
  let held = 0;
  for (const client of await clients.listOutageHeld()) {
    if (await replanQueue.getJob(replanJobId(client.id))) continue;
    await requestReplan(client.id);
    held += 1;
  }
  if (held > 0) logger.info('re-requested the turns of clients held by a provider outage', { recovered: held });

  const delayMs = env.AFTER_SEND_PLAN_DELAY_SECONDS * 1000;
  const delivered = await clients.listDeliveredWithoutPlan(env.AFTER_SEND_PLAN_DELAY_SECONDS);
  let waits = 0;
  for (const { id, sentAt } of delivered) {
    if (await replanQueue.getJob(replanJobId(id))) continue;
    await requestReplanAfterSend(id, Math.max(0, sentAt.getTime() + delayMs - Date.now()));
    waits += 1;
  }
  if (waits > 0) logger.info('re-requested lost after-send plan waits', { recovered: waits });
}
