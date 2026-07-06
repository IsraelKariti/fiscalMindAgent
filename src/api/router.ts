import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import * as clients from '../db/queries/clients.js';
import * as clientDocuments from '../db/queries/clientDocuments.js';
import * as dashboard from '../db/queries/dashboard.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import * as emails from '../db/queries/emails.js';
import { deleteBlob, downloadBlob } from '../storage/blob.js';
import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { withClientLock } from '../db/withClientLock.js';
import { onClientUpdated } from '../events/clientEvents.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { sendFutureEmailNow } from '../orchestration/sendFutureEmailNow.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { DEFAULT_PROMPT_TEMPLATE, PROMPT_PLACEHOLDERS } from '../gemini/prompt.js';
import { getPromptTemplate, resetPromptTemplate, savePromptTemplate } from '../gemini/promptSettings.js';
import { logger } from '../util/logger.js';
import { googleLoginCallback, logout, me, requireAuth, requireWhitelisted, startGoogleLogin } from './auth.js';
import {
  adminAddToWhitelist,
  adminGetModel,
  adminListAccountants,
  adminListWhitelist,
  adminRemoveFromWhitelist,
  adminSetModel,
  requireAdmin,
  startImpersonation,
  stopImpersonation,
} from './admin.js';
import { claimMailbox, mailboxAvailability, mailboxStatus } from './mailbox.js';
import {
  adminCreateWaTemplate,
  adminDeleteWaSender,
  adminDeleteWaTemplate,
  adminListWaSenders,
  adminListWaTemplates,
  adminUpsertWaSender,
  waSenderStatus,
} from './waAdmin.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const ClientPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    occupation: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

const PromptTemplateSchema = z.object({ template: z.string().min(1) }).strict();

const DocumentCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict();

const ClientCreateSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    documents: z.array(DocumentCreateSchema).max(50).default([]),
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

// Retry delays for the fire-and-forget first-email draft. Without a scheduled email the
// agent never reaches out and the UI shows "drafting…" forever. Each attempt already
// retries transient Gemini errors internally with short backoff (see decide.ts), so this
// outer exponential schedule covers longer outages: ~1.5h of trying before giving up to the logs.
const FIRST_EMAIL_RETRY_DELAYS_MS = [30_000, 120_000, 480_000, 1_800_000, 3_600_000];

/** Fire-and-forget: has the agent draft and schedule the new client's first email. */
function draftFirstEmail(clientId: string, attempt = 0): void {
  withClientLock(clientId, () => setFutureEmail(clientId)).catch((err) => {
    logger.error('first email drafting failed', err, { clientId, attempt });
    const delay = FIRST_EMAIL_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) setTimeout(() => draftFirstEmail(clientId, attempt + 1), delay);
  });
}

/** Postgres rejects non-UUID ids with an error (→ 500); pre-validate so they 404 like other misses. */
function uuidParam(value: string | undefined): string | null {
  return value && z.string().uuid().safeParse(value).success ? value : null;
}

export const apiRouter = Router();

apiRouter.get('/auth/google', startGoogleLogin);
apiRouter.get('/auth/google/callback', wrap(googleLoginCallback));
apiRouter.post('/logout', logout);
apiRouter.get('/me', wrap(me));

apiRouter.use(requireAuth);
// Paid-access gate: everything below is whitelist-only (admins always pass).
apiRouter.use(wrap(requireWhitelisted));

apiRouter.get('/admin/accountants', wrap(requireAdmin), wrap(adminListAccountants));
apiRouter.post('/admin/impersonate', wrap(requireAdmin), wrap(startImpersonation));
apiRouter.post('/admin/impersonate/stop', wrap(requireAdmin), wrap(stopImpersonation));
apiRouter.get('/admin/model', wrap(requireAdmin), wrap(adminGetModel));
apiRouter.put('/admin/model', wrap(requireAdmin), wrap(adminSetModel));
apiRouter.get('/admin/whitelist', wrap(requireAdmin), wrap(adminListWhitelist));
apiRouter.post('/admin/whitelist', wrap(requireAdmin), wrap(adminAddToWhitelist));
apiRouter.delete('/admin/whitelist/:email', wrap(requireAdmin), wrap(adminRemoveFromWhitelist));

apiRouter.get('/admin/wa-senders', wrap(requireAdmin), wrap(adminListWaSenders));
apiRouter.post('/admin/wa-senders', wrap(requireAdmin), wrap(adminUpsertWaSender));
apiRouter.delete('/admin/wa-senders/:userId', wrap(requireAdmin), wrap(adminDeleteWaSender));
apiRouter.get('/admin/wa-templates', wrap(requireAdmin), wrap(adminListWaTemplates));
apiRouter.post('/admin/wa-templates', wrap(requireAdmin), wrap(adminCreateWaTemplate));
apiRouter.delete('/admin/wa-templates/:id', wrap(requireAdmin), wrap(adminDeleteWaTemplate));

apiRouter.get('/mailbox', wrap(mailboxStatus));
apiRouter.get('/mailbox/availability', wrap(mailboxAvailability));
apiRouter.post('/mailbox', wrap(claimMailbox));
apiRouter.get('/wa-sender', wrap(waSenderStatus));

// Slightly wider than the 8 Monday-based weeks the activity chart shows, so the
// oldest visible week is always fully covered regardless of timezone.
const ACTIVITY_WINDOW_DAYS = 70;

apiRouter.get(
  '/dashboard',
  wrap(async (req, res) => {
    const [clientSummaries, activity, filesTotal] = await Promise.all([
      dashboard.listClientSummaries(req.userId!),
      dashboard.listEmailActivity(req.userId!, ACTIVITY_WINDOW_DAYS),
      dashboard.countFilesForUser(req.userId!),
    ]);
    res.json({ clients: clientSummaries, activity, filesTotal });
  }),
);

apiRouter.get(
  '/clients',
  wrap(async (req, res) => {
    res.json({ clients: await clients.listForUser(req.userId!) });
  }),
);

apiRouter.post(
  '/clients',
  wrap(async (req, res) => {
    const parsed = ClientCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid client fields.', details: parsed.error.flatten() });
      return;
    }
    const { name, email, documents } = parsed.data;

    if (!(await agentMailboxes.getByUserId(req.userId!))) {
      res.status(409).json({ error: "Choose your agent's email address first — the agent has no mailbox to send from." });
      return;
    }
    if (await clients.getByEmailAddressForUser(req.userId!, email)) {
      res.status(409).json({ error: 'A client with this email already exists.' });
      return;
    }

    const client = await clients.insert({ userId: req.userId!, name, emailAddress: email });
    for (const doc of documents) {
      await clientDocuments.insert({ clientId: client.id, name: doc.name, description: doc.description ?? null });
    }
    // Respond before the LLM drafts the first email — the drafting takes seconds, and the
    // conversation tab shows a "drafting…" placeholder until the scheduled email appears.
    draftFirstEmail(client.id);
    res.status(201).json({ client });
  }),
);

apiRouter.get(
  '/clients/:id',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    // The pending BullMQ job id embeds the draft email id: send_email:<clientId>:<emailId>.
    const job = await scheduledJobs.getForClient(client.id);
    let nextScheduled = null;
    if (job) {
      const draftId = job.bullmq_job_id.split(':')[2];
      const draft = draftId ? await emails.getById(draftId) : null;
      nextScheduled = {
        scheduledFor: job.scheduled_for,
        subject: draft?.subject ?? null,
        body: draft?.body ?? null,
        reasoning: draft?.reasoning ?? null,
      };
    }

    res.json({ client, nextScheduled, documents: await clientDocuments.listForClient(client.id) });
  }),
);

// SSE stream of "something about this client changed" ticks (reply stored, pending send
// canceled, new draft scheduled, goal completed), relayed from Redis pub/sub so transitions
// made by the worker process arrive too. The events carry no data — the browser refetches —
// so a dropped connection loses nothing the fallback poll won't recover.
apiRouter.get(
  '/clients/:id/events',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const unsubscribe = onClientUpdated(client.id, () => res.write('data: updated\n\n'));
    // Comment-only heartbeat so idle proxies (ngrok, Azure ingress) don't cut the stream.
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }),
);

apiRouter.get(
  '/clients/:id/documents',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.json({ documents: await clientDocuments.listForClient(client.id) });
  }),
);

apiRouter.post(
  '/clients/:id/documents',
  wrap(async (req, res) => {
    const parsed = DocumentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid document fields.', details: parsed.error.flatten() });
      return;
    }
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
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

apiRouter.patch(
  '/clients/:id/documents/:docId',
  wrap(async (req, res) => {
    const parsed = DocumentPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid document fields.', details: parsed.error.flatten() });
      return;
    }
    const id = uuidParam(req.params.id);
    const docId = uuidParam(req.params.docId);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    const document = client && docId ? await clientDocuments.updateForClient(docId, client.id, parsed.data) : null;
    if (!document) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    await onDocumentsChanged(client!.id);
    res.json({ document });
  }),
);

apiRouter.delete(
  '/clients/:id/documents/:docId',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const docId = uuidParam(req.params.docId);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    const removed = client && docId ? await clientDocuments.removeForClient(docId, client.id) : false;
    if (!removed) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    await onDocumentsChanged(client!.id);
    res.json({ ok: true });
  }),
);

apiRouter.patch(
  '/clients/:id',
  wrap(async (req, res) => {
    const parsed = ClientPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid client fields.', details: parsed.error.flatten() });
      return;
    }
    const id = uuidParam(req.params.id);
    const client = id ? await clients.updateDetailsForUser(id, req.userId!, parsed.data) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.json({ client });
  }),
);

apiRouter.delete(
  '/clients/:id',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    // Cancel the pending BullMQ send under the client lock so an in-flight draft/send settles first,
    // then snapshot blob keys before the cascade wipes the document_files rows.
    await withClientLock(client.id, () => removeFutureEmail(client.id));
    const files = await documentFiles.listForClient(client.id);
    await clients.removeForUser(client.id, req.userId!);
    // Best-effort blob cleanup after the rows are gone — a failure only orphans a blob.
    await Promise.all(
      files.map((file) =>
        deleteBlob(file.blob_key).catch((err) =>
          logger.error('delete client: blob cleanup failed', { blobKey: file.blob_key, err }),
        ),
      ),
    );
    res.json({ ok: true });
  }),
);

apiRouter.get(
  '/clients/:id/files',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.json({ files: await documentFiles.listForClient(client.id) });
  }),
);

// Streams the blob through the API so the container stays private and access
// rides the dashboard session (no SAS URLs to leak).
apiRouter.get(
  '/clients/:id/files/:fileId/download',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const fileId = uuidParam(req.params.fileId);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    const file = client && fileId ? await documentFiles.getForClient(fileId, client.id) : null;
    if (!file) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    const blob = await downloadBlob(file.blob_key);
    res.setHeader('Content-Type', file.content_type);
    if (blob.contentLength) res.setHeader('Content-Length', blob.contentLength);
    // RFC 5987 encoding: filenames are sanitized ASCII at ingest, but stay defensive.
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    blob.stream.pipe(res);
  }),
);

apiRouter.get(
  '/clients/:id/emails',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.json({ emails: await emails.listForClient(client.id) });
  }),
);

// "Send now": jump the scheduled follow-up's queue delay so the worker sends it right away.
apiRouter.post(
  '/clients/:id/send-now',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForUser(id, req.userId!) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const result = await withClientLock(client.id, () => sendFutureEmailNow(client.id));
    if (result === 'none_scheduled') {
      res.status(409).json({ error: 'There is no scheduled email to send.' });
      return;
    }
    // 'already_sending' also counts as success — the email is going out now either way.
    res.json({ ok: true });
  }),
);

// Admin-only, keyed on the effective user: reachable only while impersonating, so
// the admin edits the impersonated accountant's template. Accountants never see it.
apiRouter.get(
  '/prompt-template',
  wrap(requireAdmin),
  wrap(async (req, res) => {
    const state = await getPromptTemplate(req.userId!);
    res.json({ ...state, defaultTemplate: DEFAULT_PROMPT_TEMPLATE, placeholders: PROMPT_PLACEHOLDERS });
  }),
);

apiRouter.put(
  '/prompt-template',
  wrap(requireAdmin),
  wrap(async (req, res) => {
    const parsed = PromptTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Template must be a non-empty string.' });
      return;
    }
    await savePromptTemplate(req.userId!, parsed.data.template);
    const state = await getPromptTemplate(req.userId!);
    res.json({ ...state, defaultTemplate: DEFAULT_PROMPT_TEMPLATE, placeholders: PROMPT_PLACEHOLDERS });
  }),
);

apiRouter.post(
  '/prompt-template/reset',
  wrap(requireAdmin),
  wrap(async (req, res) => {
    await resetPromptTemplate(req.userId!);
    const state = await getPromptTemplate(req.userId!);
    res.json({ ...state, defaultTemplate: DEFAULT_PROMPT_TEMPLATE, placeholders: PROMPT_PLACEHOLDERS });
  }),
);

// Terminal error handler for this router: log and return JSON instead of Express's HTML error page.
apiRouter.use(((err: unknown, _req, res, _next) => {
  logger.error('api error', err);
  res.status(500).json({ error: 'Internal server error.' });
}) as import('express').ErrorRequestHandler);
