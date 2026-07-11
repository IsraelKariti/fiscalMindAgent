import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import { withClientLock } from '../../db/withClientLock.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../orchestration/setFutureEmail.js';

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
    status: z.enum(['pending', 'collected']).optional(),
  })
  .strict();

/**
 * Re-derives goal_status from the documents list after a manual change and keeps the follow-up
 * loop consistent: all collected -> mark complete and cancel any pending send; a document (re)opened
 * on a complete client -> reopen the goal and have the agent draft the next chase email.
 * While the goal stays pending, an already-scheduled email is left alone — the updated list is
 * picked up when the next email is drafted.
 */
async function onDocumentsChanged(clientId: string): Promise<void> {
  const [client, docs] = await Promise.all([clients.getById(clientId), clientDocuments.listForClient(clientId)]);
  if (!client) return;
  const allCollected = docs.length > 0 && docs.every((d) => d.status === 'collected');

  if (allCollected && client.goal_status === 'pending') {
    await clients.updateGoalStatus(clientId, 'complete');
    await withClientLock(clientId, () => removeFutureEmail(clientId));
  } else if (!allCollected && client.goal_status === 'complete') {
    await clients.updateGoalStatus(clientId, 'pending');
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

/** The doc collector's required-documents CRUD, composed into the workspace router. */
export function buildRouter(): Router {
  const router = Router();

  // Composed into the shared workspace router alongside other agent types'
  // routes — bail out to it when the active agent isn't the doc collector.
  router.use((req, _res, next) => {
    if (req.agentInstance && req.agentInstance.agent_type !== 'doc_collector') {
      next('router');
      return;
    }
    next();
  });

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
      await onDocumentsChanged(client.id);
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
      const document = client && docId ? await clientDocuments.updateForClient(docId, client.id, parsed.data) : null;
      if (!document) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      await onDocumentsChanged(client!.id);
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
      await onDocumentsChanged(client!.id);
      res.json({ ok: true });
    }),
  );

  return router;
}
