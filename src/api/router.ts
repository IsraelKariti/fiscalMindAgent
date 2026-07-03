import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { DEFAULT_PROMPT_TEMPLATE, PROMPT_PLACEHOLDERS } from '../gemini/prompt.js';
import { getPromptTemplate, resetPromptTemplate, savePromptTemplate } from '../gemini/promptSettings.js';
import { logger } from '../util/logger.js';
import { login, logout, me, requireAuth } from './auth.js';

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

/** Postgres rejects non-UUID ids with an error (→ 500); pre-validate so they 404 like other misses. */
function uuidParam(value: string | undefined): string | null {
  return value && z.string().uuid().safeParse(value).success ? value : null;
}

export const apiRouter = Router();

apiRouter.post('/login', login);
apiRouter.post('/logout', logout);
apiRouter.get('/me', me);

apiRouter.use(requireAuth);

apiRouter.get(
  '/clients',
  wrap(async (_req, res) => {
    res.json({ clients: await clients.listAll() });
  }),
);

apiRouter.get(
  '/clients/:id',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getById(id) : null;
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
    const client = id ? await clients.updateDetails(id, parsed.data) : null;
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
    const client = id ? await clients.getById(id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.json({ emails: await emails.listForClient(client.id) });
  }),
);

apiRouter.get(
  '/prompt-template',
  wrap(async (_req, res) => {
    const state = await getPromptTemplate();
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
    await savePromptTemplate(parsed.data.template);
    const state = await getPromptTemplate();
    res.json({ ...state, defaultTemplate: DEFAULT_PROMPT_TEMPLATE, placeholders: PROMPT_PLACEHOLDERS });
  }),
);

apiRouter.post(
  '/prompt-template/reset',
  wrap(async (_req, res) => {
    await resetPromptTemplate();
    const state = await getPromptTemplate();
    res.json({ ...state, defaultTemplate: DEFAULT_PROMPT_TEMPLATE, placeholders: PROMPT_PLACEHOLDERS });
  }),
);

// Terminal error handler for this router: log and return JSON instead of Express's HTML error page.
apiRouter.use(((err: unknown, _req, res, _next) => {
  logger.error('api error', err);
  res.status(500).json({ error: 'Internal server error.' });
}) as import('express').ErrorRequestHandler);
