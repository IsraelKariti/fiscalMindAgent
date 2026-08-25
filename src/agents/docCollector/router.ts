import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import { withClientLock } from '../../db/withClientLock.js';
import { recordAudit } from '../../audit/audit.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../orchestration/setFutureEmail.js';
import { resumeFutureEmail } from '../../orchestration/resumeFutureEmail.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { DueDateSchema } from '../../api/schemas.js';
import { toWorkspaceClient } from '../../api/workspaceSerialize.js';
import { registerClientSourceRoutes } from '../shared/clientSourcesRoutes.js';
import {
  MONDAY_STATUS_AGENT_WORKING,
  MONDAY_STATUS_DOCS_COLLECTED,
  syncMondayStatus,
} from '../shared/mondayStatusSync.js';
import { isDocCollectorFamily } from './family.js';
import { sendGoalCompleteEmail } from './notifyAccountant.js';
import { DocCollectorSettingsSchema, parseSettings } from './settings.js';
import { logger } from '../../util/logger.js';
import type { DocumentStatus } from '../../db/types.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const DocumentCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict();

const DocumentPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(['pending', 'collected', 'not_required', 'approved']).optional(),
  })
  .strict();

/** Statuses only the capital-declaration flow uses; other family types reject them. */
const CAPITAL_ONLY_STATUSES = new Set<DocumentStatus>(['not_required', 'approved']);

/**
 * Which statuses an accountant may move a row FROM, per requested status.
 * 'unresolved' and 'claimed' are never set by hand (seeding / the agent own
 * them); 'approved' by hand exists only as the dead-end override — a document
 * that was actually received (collected, or claimed physical delivery the
 * accountant vouches for).
 */
const MANUAL_TRANSITIONS: Record<string, DocumentStatus[]> = {
  // 'superseded' is agent-set only (requirements-ladder retirement), but the
  // accountant may reopen such a row to pending if the retirement was wrong.
  pending: ['unresolved', 'not_required', 'claimed', 'collected', 'approved', 'superseded'],
  collected: ['pending', 'claimed'],
  not_required: ['unresolved', 'pending', 'claimed'],
  approved: ['collected', 'claimed'],
};

/**
 * Re-derives goal_status from the documents list after a manual change and keeps the follow-up
 * loop consistent: goal done -> mark complete and cancel any pending send; a document (re)opened
 * on a complete client -> reopen the goal and have the agent draft the next chase email.
 * While the goal stays pending, an already-scheduled email is left alone — the updated list is
 * picked up when the next email is drafted.
 *
 * Doc collector: done = every document collected. Declaration of capital:
 * done = every row approved/not_required AND the client's attestation stands —
 * and a manual change that reopens a settled list voids any earlier
 * attestation (a stale confirmation must not complete the goal later).
 */
async function onDocumentsChanged(clientId: string, agentType: string): Promise<void> {
  const [client, docs] = await Promise.all([clients.getById(clientId), clientDocuments.listForClient(clientId)]);
  if (!client) return;
  const isCapital = agentType === 'declaration_of_capital';
  let allCollected: boolean;
  if (isCapital) {
    const settled =
      docs.length > 0 &&
      docs.every((d) => d.status === 'approved' || d.status === 'not_required' || d.status === 'superseded');
    const attestationTouched =
      typeof client.agent_fields['attestation_confirmed_at'] === 'string' ||
      typeof client.agent_fields['attestation_request_email_id'] === 'string';
    if (!settled && attestationTouched) await clients.clearAttestation(clientId);
    allCollected = settled && typeof client.agent_fields['attestation_confirmed_at'] === 'string';
  } else {
    allCollected = docs.length > 0 && docs.every((d) => d.status === 'collected');
  }

  if (allCollected && client.goal_status === 'pending') {
    await clients.updateGoalStatus(clientId, 'complete');
    // Report the finished collection back to the board row's status column.
    void syncMondayStatus(clientId, MONDAY_STATUS_DOCS_COLLECTED);
    await withClientLock(clientId, () => removeFutureEmail(clientId));
    sendGoalCompleteEmail(client).catch((err) => logger.error('goal-complete notification failed', err, { clientId }));
  } else if (!allCollected && client.goal_status === 'complete') {
    await clients.updateGoalStatus(clientId, 'pending');
    // The goal reopened — the board must not keep claiming the documents are in.
    void syncMondayStatus(clientId, MONDAY_STATUS_AGENT_WORKING);
    await withClientLock(clientId, async () => {
      await removeFutureEmail(clientId);
      await setFutureEmail(clientId);
    });
  }
}

/** Postgres rejects non-UUID ids with an error (→ 500); pre-validate so they 404 like other misses. */
function uuidParam(value: string | undefined): string | null {
  return value && z.string().uuid().safeParse(value).success ? value : null;
}

const DueDatePutSchema = z.object({ dueDate: DueDateSchema.nullable() }).strict();

/** The doc collector's required-documents CRUD and due-date editing, composed into the workspace router. */
export function buildRouter(): Router {
  const router = Router();

  // Composed into the shared workspace router alongside other agent types'
  // routes — bail out to it when the active agent isn't a doc-collector-family
  // type (the declaration-of-capital collector shares these routes wholesale).
  router.use((req, _res, next) => {
    if (req.agentInstance && !isDocCollectorFamily(req.agentInstance.agent_type)) {
      next('router');
      return;
    }
    next();
  });

  // Client-import sources (boards/sheets + the default-documents checklist).
  registerClientSourceRoutes(router, { schema: DocCollectorSettingsSchema, parse: parseSettings });

  // Sets or clears the collection due date. Editing it always clears both
  // overdue markers (a new deadline may notify again when it passes); if the
  // agent had stopped because the old deadline passed, editing the date is the
  // accountant's signal to hand the client back — unpause and re-plan.
  router.put(
    '/clients/:id/due-date',
    wrap(async (req, res) => {
      const parsed = DueDatePutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid due date.', details: parsed.error.flatten() });
        return;
      }
      const id = uuidParam(req.params.id);
      const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
      if (!client) {
        res.status(404).json({ error: 'Client not found.' });
        return;
      }
      const wasOverdueStopped = client.paused && typeof client.agent_fields['overdue_stopped_at'] === 'string';
      let updated = await clients.setDocCollectorDueDate(client.id, req.agentInstance!.id, parsed.data.dueDate);
      if (!updated) {
        res.status(404).json({ error: 'Client not found.' });
        return;
      }
      if (wasOverdueStopped) {
        updated = (await clients.setPaused(client.id, false)) ?? updated;
        await withClientLock(client.id, () => resumeFutureEmail(client.id));
      }
      publishClientUpdated(client.id);
      res.json({ client: toWorkspaceClient(updated) });
    }),
  );

  router.get(
    '/clients/:id/documents',
    wrap(async (req, res) => {
      const id = uuidParam(req.params.id);
      const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
      if (!client) {
        res.status(404).json({ error: 'Client not found.' });
        return;
      }
      res.json({ documents: await clientDocuments.listForClient(client.id) });
    }),
  );

  router.post(
    '/clients/:id/documents',
    wrap(async (req, res) => {
      const parsed = DocumentCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid document fields.', details: parsed.error.flatten() });
        return;
      }
      const id = uuidParam(req.params.id);
      const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
      if (!client) {
        res.status(404).json({ error: 'Client not found.' });
        return;
      }
      const document = await clientDocuments.insert({
        clientId: client.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      });
      await onDocumentsChanged(client.id, req.agentInstance!.agent_type);
      res.status(201).json({ document });
    }),
  );

  router.patch(
    '/clients/:id/documents/:docId',
    wrap(async (req, res) => {
      const parsed = DocumentPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid document fields.', details: parsed.error.flatten() });
        return;
      }
      const id = uuidParam(req.params.id);
      const docId = uuidParam(req.params.docId);
      const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
      const current = client && docId ? await clientDocuments.getForClient(docId, client.id) : null;
      if (!current) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      const requested = parsed.data.status;
      if (requested && requested !== current.status) {
        const isCapital = req.agentInstance!.agent_type === 'declaration_of_capital';
        if (!isCapital && CAPITAL_ONLY_STATUSES.has(requested)) {
          res.status(400).json({ error: `Status "${requested}" does not apply to this agent type.` });
          return;
        }
        if (!MANUAL_TRANSITIONS[requested]?.includes(current.status)) {
          res.status(400).json({ error: `Cannot change a "${current.status}" document to "${requested}".` });
          return;
        }
      }
      const document = await clientDocuments.updateForClient(current.id, client!.id, parsed.data);
      if (!document) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      if (parsed.data.status) {
        // The human half of the claimed→collected flow (or a manual reopen) —
        // audited so a compromised session flipping statuses leaves a trail.
        // realUserId over userId: while impersonating, the actor is the admin.
        recordAudit({
          actorType: 'accountant',
          action: 'document.status_changed',
          actorUserId: req.realUserId ?? req.userId ?? null,
          agentInstanceId: req.agentInstance!.id,
          clientId: client!.id,
          targetType: 'client_document',
          targetId: document.id,
          detail: { clientName: client!.name, name: document.name, status: parsed.data.status },
        });
      }
      await onDocumentsChanged(client!.id, req.agentInstance!.agent_type);
      res.json({ document });
    }),
  );

  router.delete(
    '/clients/:id/documents/:docId',
    wrap(async (req, res) => {
      const id = uuidParam(req.params.id);
      const docId = uuidParam(req.params.docId);
      const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
      const removed = client && docId ? await clientDocuments.removeForClient(docId, client.id) : false;
      if (!removed) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      await onDocumentsChanged(client!.id, req.agentInstance!.agent_type);
      res.json({ ok: true });
    }),
  );

  return router;
}
