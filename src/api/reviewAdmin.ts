import { z } from 'zod';
import type { RequestHandler } from 'express';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { withClientLock } from '../db/withClientLock.js';
import { adminCommsPaused, isSupervisedInstance, replanClientsAfterUnpause } from '../orchestration/adminPause.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';
import type { ReviewQueueRow } from '../db/queries/emails.js';

/**
 * Admin-only supervision of the declaration_of_capital pilot (048): the
 * message review queue and the hidden pause switches. Everything here mounts
 * behind requireAdmin (which also audits every mutation); none of it is ever
 * exposed to the accountant-facing workspace.
 */

function toReviewMessage(r: ReviewQueueRow) {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    clientAdminPaused: r.client_admin_paused,
    agentInstanceId: r.agent_instance_id,
    agentType: r.agent_type,
    instanceName: r.instance_name,
    accountantEmail: r.accountant_email,
    accountantName: r.accountant_name,
    channel: r.channel,
    isTemplate: Boolean(r.wa_content_sid),
    body: r.body,
    reasoning: r.reasoning,
    createdAt: r.created_at,
    heldAt: r.held_at,
    /** NULL if the mirror row is gone (shouldn't happen for live pending drafts). */
    scheduledFor: r.scheduled_for,
    /** The send time passed unapproved — approval now sends immediately. */
    pastDue: r.status === 'held',
  };
}

/** GET /api/admin/review/messages — drafts awaiting approval, soonest send first. */
export const adminListReviewMessages: RequestHandler = async (_req, res) => {
  const rows = await emails.listPendingReview();
  res.json({ messages: rows.map(toReviewMessage) });
};

/** GET /api/admin/review/count — the nav badge poll. */
export const adminReviewCount: RequestHandler = async (_req, res) => {
  res.json({ pendingCount: await emails.countPendingReview() });
};

/**
 * Shared guards for approve/regenerate. Returns the draft + client or null
 * after having written the error response.
 */
async function loadPendingDraft(
  emailIdRaw: string,
  res: Parameters<RequestHandler>[1],
): Promise<{ draftId: string; clientId: string } | null> {
  const emailId = z.string().uuid().safeParse(emailIdRaw);
  const draft = emailId.success ? await emails.getById(emailId.data) : null;
  if (!draft) {
    res.status(404).json({ error: 'Message not found.' });
    return null;
  }
  if (draft.review_status !== 'pending') {
    res.status(409).json({ error: 'This message is no longer awaiting review.' });
    return null;
  }
  return { draftId: draft.id, clientId: draft.client_id };
}

/**
 * POST /api/admin/review/messages/:emailId/approve — clear the draft to send.
 * Before its send time this is just a stamp (the delayed job sends on
 * schedule); a parked draft is re-enqueued to send immediately. The original
 * jobId is squatted by its completed job, so the re-add uses an ':approved'
 * suffix — every jobId consumer parses by split(':') positions, which the
 * extra segment doesn't disturb.
 */
export const adminApproveReviewMessage: RequestHandler = async (req, res) => {
  const target = await loadPendingDraft(req.params.emailId ?? '', res);
  if (!target) return;

  await withClientLock(target.clientId, async () => {
    const client = await clients.getById(target.clientId);
    if (!client || client.goal_status === 'complete' || client.paused || (await adminCommsPaused(client))) {
      res.status(409).json({ error: 'The client is paused or complete — the message cannot be approved.' });
      return;
    }
    const before = await emails.getById(target.draftId);
    const approved = before ? await emails.approvePending(target.draftId) : null;
    if (!before || !approved) {
      res.status(409).json({ error: 'This message is no longer awaiting review.' });
      return;
    }
    if (before.status === 'held') {
      const jobId = `send_email:${target.clientId}:${target.draftId}:approved`;
      await sendEmailQueue.add('send_email', { clientId: target.clientId, emailId: target.draftId }, { jobId });
      await scheduledJobs.upsertForClient(target.clientId, jobId, new Date());
    }
    publishClientUpdated(target.clientId);
    res.json({ ok: true, sentImmediately: before.status === 'held' });
  });
};

/**
 * POST /api/admin/review/messages/:emailId/regenerate — discard the pending
 * draft and have the agent decide afresh. The replanned draft re-enters the
 * review queue via the draft-time hook, at its own planned send time.
 */
export const adminRegenerateReviewMessage: RequestHandler = async (req, res) => {
  const target = await loadPendingDraft(req.params.emailId ?? '', res);
  if (!target) return;

  const blocked = await withClientLock(target.clientId, async () => {
    const client = await clients.getById(target.clientId);
    if (!client || client.goal_status === 'complete' || client.paused || (await adminCommsPaused(client))) return true;
    // Supersedes the pending draft and cancels its job; the UI refetch after
    // the 202 already sees it gone from the queue.
    await removeFutureEmail(target.clientId);
    await clients.markDraftingStarted(target.clientId);
    return false;
  });
  if (blocked) {
    res.status(409).json({ error: 'The client is paused or complete — the message cannot be regenerated.' });
    return;
  }

  withClientLock(target.clientId, () => setFutureEmail(target.clientId)).catch((err) =>
    logger.error('review regenerate replan failed', err, { clientId: target.clientId }),
  );
  publishClientUpdated(target.clientId);
  res.status(202).json({ ok: true });
};

/** Resolves + validates the pilot instance for the toggle routes. */
async function loadSupervisedInstance(instanceIdRaw: unknown, res: Parameters<RequestHandler>[1]) {
  const id = z.string().uuid().safeParse(instanceIdRaw);
  const instance = id.success ? await agentInstances.getById(id.data) : null;
  if (!instance) {
    res.status(404).json({ error: 'Agent not found.' });
    return null;
  }
  if (!isSupervisedInstance(instance)) {
    res.status(400).json({ error: 'Pilot supervision is only available for the declaration of capital agent.' });
    return null;
  }
  return instance;
}

const ReviewModeSchema = z.object({ agentInstanceId: z.string().uuid(), reviewMode: z.boolean() }).strict();

/** POST /api/admin/agent-review-mode — toggle manual message review for a pilot instance. */
export const adminSetAgentReviewMode: RequestHandler = async (req, res) => {
  const parsed = ReviewModeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { agentInstanceId, reviewMode }.' });
    return;
  }
  const instance = await loadSupervisedInstance(parsed.data.agentInstanceId, res);
  if (!instance) return;
  const updated = await agentInstances.setReviewMode(instance.id, parsed.data.reviewMode);
  logger.info('agent review mode set', {
    adminUserId: req.realUserId,
    instanceId: instance.id,
    reviewMode: parsed.data.reviewMode,
  });
  res.json({ reviewMode: updated?.review_mode ?? parsed.data.reviewMode });
};

const AgentPauseSchema = z.object({ agentInstanceId: z.string().uuid(), paused: z.boolean() }).strict();

/**
 * POST /api/admin/agent-admin-pause — the instance-wide emergency brake.
 * Pausing is a pure flag flip (the plan/act gates do the rest, including for
 * clients enrolled by the webhook while paused); unpausing replans every
 * client in the background to recover swallowed sends and unanswered replies.
 */
export const adminSetAgentAdminPause: RequestHandler = async (req, res) => {
  const parsed = AgentPauseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { agentInstanceId, paused }.' });
    return;
  }
  const instance = await loadSupervisedInstance(parsed.data.agentInstanceId, res);
  if (!instance) return;
  const updated = await agentInstances.setAdminPaused(instance.id, parsed.data.paused);
  logger.info('agent admin pause set', {
    adminUserId: req.realUserId,
    instanceId: instance.id,
    paused: parsed.data.paused,
  });
  if (!parsed.data.paused) {
    void (async () => {
      const instanceClients = await clients.listForInstance(instance.id);
      await replanClientsAfterUnpause(instanceClients.map((c) => c.id));
    })().catch((err) => logger.error('instance unpause replan failed', err, { instanceId: instance.id }));
  }
  res.json({ paused: updated?.admin_paused ?? parsed.data.paused });
};

const ClientPauseSchema = z.object({ paused: z.boolean() }).strict();

/** POST /api/admin/clients/:clientId/admin-pause — the per-client emergency brake. */
export const adminSetClientAdminPause: RequestHandler = async (req, res) => {
  const parsed = ClientPauseSchema.safeParse(req.body);
  const clientId = z.string().uuid().safeParse(req.params.clientId);
  if (!parsed.success || !clientId.success) {
    res.status(400).json({ error: 'Expected { paused }.' });
    return;
  }
  const client = await clients.getById(clientId.data);
  if (!client) {
    res.status(404).json({ error: 'Client not found.' });
    return;
  }
  const instance = client.agent_instance_id ? await agentInstances.getById(client.agent_instance_id) : null;
  if (!isSupervisedInstance(instance)) {
    res.status(400).json({ error: 'Pilot supervision is only available for the declaration of capital agent.' });
    return;
  }
  const updated = await clients.setAdminPaused(client.id, parsed.data.paused);
  logger.info('client admin pause set', {
    adminUserId: req.realUserId,
    clientId: client.id,
    paused: parsed.data.paused,
  });
  if (!parsed.data.paused) {
    replanClientsAfterUnpause([client.id]).catch((err) =>
      logger.error('client unpause replan failed', err, { clientId: client.id }),
    );
  }
  res.json({ paused: updated?.admin_paused ?? parsed.data.paused });
};
