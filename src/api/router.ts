import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { scheduleDraftEmail } from '../orchestration/scheduleDraftEmail.js';
import { hoursToMs } from '../util/time.js';
import { DEFAULT_PROMPT_TEMPLATE, PROMPT_PLACEHOLDERS } from '../gemini/prompt.js';
import { getPromptTemplate, resetPromptTemplate, savePromptTemplate } from '../gemini/promptSettings.js';
import { logger } from '../util/logger.js';
import { googleLoginCallback, logout, me, requireAuth, startGoogleLogin } from './auth.js';
import { claimMailbox, mailboxAvailability, mailboxStatus } from './mailbox.js';

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

const ClientCreateSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
    delayMinutes: z.number().int().min(0).max(60 * 24 * 30),
  })
  .strict();

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

apiRouter.get('/mailbox', wrap(mailboxStatus));
apiRouter.get('/mailbox/availability', wrap(mailboxAvailability));
apiRouter.post('/mailbox', wrap(claimMailbox));

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
    const { name, email, subject, body, delayMinutes } = parsed.data;

    if (!(await agentMailboxes.getByUserId(req.userId!))) {
      res.status(409).json({ error: "Choose your agent's email address first — the agent has no mailbox to send from." });
      return;
    }
    if (await clients.getByEmailAddressForUser(req.userId!, email)) {
      res.status(409).json({ error: 'A client with this email already exists.' });
      return;
    }

    const client = await clients.insert({ userId: req.userId!, name, emailAddress: email });
    await scheduleDraftEmail(client.id, { subject, body, delayMs: hoursToMs(delayMinutes / 60) });
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
      };
    }

    res.json({ client, nextScheduled });
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

apiRouter.get(
  '/prompt-template',
  wrap(async (req, res) => {
    const state = await getPromptTemplate(req.userId!);
    res.json({ ...state, defaultTemplate: DEFAULT_PROMPT_TEMPLATE, placeholders: PROMPT_PLACEHOLDERS });
  }),
);

apiRouter.put(
  '/prompt-template',
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
