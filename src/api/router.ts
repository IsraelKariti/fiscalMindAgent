import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { DEFAULT_PROMPT_TEMPLATE, PROMPT_PLACEHOLDERS } from '../agents/docCollector/prompt.js';
import { getPromptTemplate, resetPromptTemplate, savePromptTemplate } from '../gemini/promptSettings.js';
import { logger } from '../util/logger.js';
import { googleLoginCallback, logout, me, mondayHandoff, requireAuth, requireWhitelisted, startGoogleLogin } from './auth.js';
import { accountRouter } from './account.js';
import { mondayOauthCallback, startMondayOauth } from './mondayOauth.js';
import { listAgents, resolveAgentInstance } from './agents.js';
import { mondayRouter } from './monday.js';
import { workspaceRouter } from './workspace.js';
import {
  adminAddToWhitelist,
  adminDisableAgent,
  adminEnableAgent,
  adminGetModel,
  adminListAccountantAgents,
  adminListAccountants,
  adminListWhitelist,
  adminRemoveFromWhitelist,
  adminSetModel,
  adminSetTier,
  requireAdmin,
  startImpersonation,
  stopImpersonation,
} from './admin.js';
import {
  adminCreateWaTemplate,
  adminDeleteWaSender,
  adminDeleteWaTemplate,
  adminListWaSenders,
  adminListWaTemplates,
  adminUpsertWaSender,
} from './waAdmin.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const PromptTemplateSchema = z.object({ template: z.string().min(1) }).strict();

export const apiRouter = Router();

apiRouter.get('/auth/google', startGoogleLogin);
apiRouter.get('/auth/google/callback', wrap(googleLoginCallback));
apiRouter.get('/auth/monday-handoff', wrap(mondayHandoff));
// monday OAuth connect (server-side API token): pre-auth — the signed state
// token carries the user identity through the top-level popup.
apiRouter.get('/auth/monday/start', startMondayOauth);
apiRouter.get('/auth/monday/callback', wrap(mondayOauthCallback));
apiRouter.post('/logout', logout);
apiRouter.get('/me', wrap(me));

// monday.com surfaces (widget + custom object): authenticated by monday's
// sessionToken (Bearer header), not the session cookie, so they mount before
// requireAuth.
apiRouter.use('/monday', mondayRouter);

apiRouter.use(requireAuth);
// Paid-access gate: everything below is whitelist-only (admins always pass).
apiRouter.use(wrap(requireWhitelisted));

apiRouter.get('/admin/accountants', wrap(requireAdmin), wrap(adminListAccountants));
apiRouter.get('/admin/accountants/:userId/agents', wrap(requireAdmin), wrap(adminListAccountantAgents));
apiRouter.post('/admin/accountants/:userId/agents', wrap(requireAdmin), wrap(adminEnableAgent));
apiRouter.delete('/admin/accountants/:userId/agents/:agentType', wrap(requireAdmin), wrap(adminDisableAgent));
apiRouter.post('/admin/impersonate', wrap(requireAdmin), wrap(startImpersonation));
apiRouter.post('/admin/impersonate/stop', wrap(requireAdmin), wrap(stopImpersonation));
apiRouter.get('/admin/model', wrap(requireAdmin), wrap(adminGetModel));
apiRouter.put('/admin/model', wrap(requireAdmin), wrap(adminSetModel));
apiRouter.get('/admin/whitelist', wrap(requireAdmin), wrap(adminListWhitelist));
apiRouter.post('/admin/whitelist', wrap(requireAdmin), wrap(adminAddToWhitelist));
apiRouter.delete('/admin/whitelist/:email', wrap(requireAdmin), wrap(adminRemoveFromWhitelist));
apiRouter.put('/admin/whitelist/:email/tier', wrap(requireAdmin), wrap(adminSetTier));

apiRouter.get('/admin/wa-senders', wrap(requireAdmin), wrap(adminListWaSenders));
apiRouter.post('/admin/wa-senders', wrap(requireAdmin), wrap(adminUpsertWaSender));
apiRouter.delete('/admin/wa-senders/:agentInstanceId', wrap(requireAdmin), wrap(adminDeleteWaSender));
apiRouter.get('/admin/wa-templates', wrap(requireAdmin), wrap(adminListWaTemplates));
apiRouter.post('/admin/wa-templates', wrap(requireAdmin), wrap(adminCreateWaTemplate));
apiRouter.delete('/admin/wa-templates/:id', wrap(requireAdmin), wrap(adminDeleteWaTemplate));

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

// Account-level routes shared by every agent (mailbox, monday connection).
apiRouter.use(accountRouter);

// The agent workspace (clients, documents, files, conversation), shared with
// the monday mount in monday.ts. Agent-scoped under /agents/:agentId; the
// unprefixed mount resolves to the user's doc_collector instance so existing
// clients keep working during the transition.
apiRouter.get('/agents', wrap(listAgents));
apiRouter.use('/agents/:agentId', wrap(resolveAgentInstance), workspaceRouter);
apiRouter.use(wrap(resolveAgentInstance), workspaceRouter);

// Terminal error handler for this router: log and return JSON instead of Express's HTML error page.
apiRouter.use(((err: unknown, _req, res, _next) => {
  logger.error('api error', err);
  res.status(500).json({ error: 'Internal server error.' });
}) as import('express').ErrorRequestHandler);
