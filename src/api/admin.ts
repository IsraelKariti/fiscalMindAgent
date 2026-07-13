import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as llmUsage from '../db/queries/llmUsage.js';
import * as users from '../db/queries/users.js';
import * as waSenders from '../db/queries/waSenders.js';
import * as whitelist from '../db/queries/whitelist.js';
import { listAgentTypes } from '../agents/registry.js';
import { env } from '../config/env.js';
import { getPricingForModel } from '../gemini/pricing.js';
import {
  GEMINI_MODEL_OPTIONS,
  getGeminiModelState,
  saveGeminiModel,
} from '../gemini/modelSettings.js';
import { logger } from '../util/logger.js';
import { clearImpersonationCookie, isAdminEmail, setImpersonationCookie } from './auth.js';

const ImpersonateSchema = z.object({ userId: z.string().uuid() }).strict();

const ModelSchema = z.object({ model: z.enum(GEMINI_MODEL_OPTIONS) }).strict();

const WhitelistAddSchema = z
  .object({
    email: z.string().email().max(320),
    name: z.string().min(1).max(200).nullable().optional(),
    tier: z.enum(['normal', 'premium']).optional(),
  })
  .strict();

/**
 * Gates the admin endpoints on the REAL signed-in user (req.realUserId), so
 * they keep working — notably stop-impersonation — while impersonating.
 */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    const user = await users.getById(req.realUserId!);
    if (!user || !isAdminEmail(user.email)) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/accountants — every accountant with their agent instances
 * (type, enabled, client count) and per-model Gemini usage, each model's
 * tokens priced at its own rates (cost null while the pricing registry has no
 * entry for it). Agent-specific progress lives on the per-agent admin pages,
 * not here. Admin accounts (ADMIN_EMAILS) are not accountants and are
 * excluded.
 */
export const adminListAccountants: RequestHandler = async (_req, res) => {
  const [list, usageRows, instances] = await Promise.all([
    users.listAll(),
    llmUsage.listAll(),
    agentInstances.listAllWithClientCounts(),
  ]);

  const agentsByUser = new Map<string, object[]>();
  for (const instance of instances) {
    const entries = agentsByUser.get(instance.user_id) ?? [];
    entries.push({
      id: instance.id,
      agentType: instance.agent_type,
      name: instance.name,
      enabled: instance.enabled,
      clientCount: instance.client_count,
    });
    agentsByUser.set(instance.user_id, entries);
  }

  const models = [...new Set(usageRows.map((r) => r.model))];
  const pricingByModel = new Map(
    await Promise.all(models.map(async (m) => [m, await getPricingForModel(m)] as const)),
  );

  const usageByUser = new Map<string, object[]>();
  for (const row of usageRows) {
    const pricing = pricingByModel.get(row.model) ?? null;
    const entries = usageByUser.get(row.user_id) ?? [];
    entries.push({
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      thinkingTokens: row.thinking_tokens,
      cost: pricing
        ? row.input_tokens * pricing.inputCostPerToken +
          row.output_tokens * pricing.outputCostPerToken +
          row.thinking_tokens * pricing.thinkingCostPerToken
        : null,
    });
    usageByUser.set(row.user_id, entries);
  }

  res.json({
    accountants: list
      .filter((u) => !isAdminEmail(u.email))
      .map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.created_at,
        mailbox: u.mailbox_address,
        whitelisted: u.whitelisted,
        tier: u.tier,
        agents: agentsByUser.get(u.id) ?? [],
        llmUsage: usageByUser.get(u.id) ?? [],
      })),
  });
};

const DailyUsageQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/**
 * GET /api/admin/llm-usage/daily?days=N — the last N days (default 30) of LLM
 * token usage, one row per (day, accountant, agent instance, model), each
 * model's tokens priced at its own rates (cost null while the pricing registry
 * has no entry). Days are bucketed in ACCOUNTANT_TIMEZONE, matching how the
 * rows were written. The rows are the raw cube — the admin dashboard groups
 * and filters client-side, so one endpoint serves every comparison view.
 */
export const adminLlmUsageDaily: RequestHandler = async (req, res) => {
  const parsed = DailyUsageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid range.' });
    return;
  }
  const sinceInstant = new Date(Date.now() - (parsed.data.days - 1) * 86_400_000);
  const since = new Intl.DateTimeFormat('en-CA', { timeZone: env.ACCOUNTANT_TIMEZONE }).format(sinceInstant);
  const rows = await llmUsage.listDaily(since);

  const models = [...new Set(rows.map((r) => r.model))];
  const pricingByModel = new Map(
    await Promise.all(models.map(async (m) => [m, await getPricingForModel(m)] as const)),
  );

  res.json({
    since,
    rows: rows.map((r) => {
      const pricing = pricingByModel.get(r.model) ?? null;
      return {
        day: r.day,
        userId: r.user_id,
        agentInstanceId: r.agent_instance_id,
        agentType: r.agent_type,
        instanceName: r.instance_name,
        model: r.model,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        thinkingTokens: r.thinking_tokens,
        cost: pricing
          ? r.input_tokens * pricing.inputCostPerToken +
            r.output_tokens * pricing.outputCostPerToken +
            r.thinking_tokens * pricing.thinkingCostPerToken
          : null,
      };
    }),
  });
};

const AgentEnableSchema = z.object({ agentType: z.string().min(1) }).strict();

function knownAgentTypes(): Set<string> {
  return new Set(listAgentTypes().map((d) => d.id));
}

/** GET /api/admin/accountants/:userId/agents — the accountant's instances (incl. disabled) + enableable types. */
export const adminListAccountantAgents: RequestHandler = async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  if (!userId.success || !(await users.getById(userId.data))) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const instances = await agentInstances.listAllForUser(userId.data);
  const senders = await waSenders.listForUser(userId.data);
  const numberByInstance = new Map(senders.map((s) => [s.agent_instance_id, s.phone_number]));
  res.json({
    agents: instances.map((i) => ({
      id: i.id,
      agentType: i.agent_type,
      name: i.name,
      enabled: i.enabled,
      waPhoneNumber: numberByInstance.get(i.id) ?? null,
    })),
    availableTypes: [...knownAgentTypes()],
  });
};

/** POST /api/admin/accountants/:userId/agents — enable an agent type for the accountant (creates or re-enables). */
export const adminEnableAgent: RequestHandler = async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  const parsed = AgentEnableSchema.safeParse(req.body);
  if (!parsed.success || !knownAgentTypes().has(parsed.data.agentType)) {
    res.status(400).json({ error: 'Unknown agent type.' });
    return;
  }
  if (!userId.success || !(await users.getById(userId.data))) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const instance = await agentInstances.enableInstance(userId.data, parsed.data.agentType);
  logger.info('agent enabled', { adminUserId: req.realUserId, userId: userId.data, agentType: instance.agent_type });
  res.status(201).json({ agent: { id: instance.id, agentType: instance.agent_type, name: instance.name, enabled: instance.enabled } });
};

/**
 * DELETE /api/admin/accountants/:userId/agents/:agentType — disable (never
 * delete: clients cascade off the instance row, so deleting would destroy the
 * agent's client data; disabling keeps everything for a later re-enable).
 */
export const adminDisableAgent: RequestHandler = async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  const agentType = req.params.agentType;
  const instance = userId.success && agentType ? await agentInstances.disableInstance(userId.data, agentType) : null;
  if (!instance) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  logger.info('agent disabled', { adminUserId: req.realUserId, userId: userId.success ? userId.data : null, agentType });
  res.json({ ok: true });
};

/** POST /api/admin/impersonate — start viewing the given accountant's dashboard. */
export const startImpersonation: RequestHandler = async (req, res) => {
  const parsed = ImpersonateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user id.' });
    return;
  }
  if (parsed.data.userId === req.realUserId) {
    res.status(400).json({ error: 'You are already signed in as this user.' });
    return;
  }
  const target = await users.getById(parsed.data.userId);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (isAdminEmail(target.email)) {
    res.status(403).json({ error: 'Admin accounts cannot be impersonated.' });
    return;
  }
  setImpersonationCookie(res, req.realUserId!, target.id);
  logger.info('impersonation started', { adminUserId: req.realUserId, targetUserId: target.id, targetEmail: target.email });
  res.json({ ok: true });
};

/** POST /api/admin/impersonate/stop — return to the admin's own dashboard. */
export const stopImpersonation: RequestHandler = async (req, res) => {
  clearImpersonationCookie(res);
  logger.info('impersonation stopped', { adminUserId: req.realUserId, targetUserId: req.userId });
  res.json({ ok: true });
};

/** GET /api/admin/model — the model every LLM call runs on, plus the pickable options. */
export const adminGetModel: RequestHandler = async (_req, res) => {
  const state = await getGeminiModelState();
  res.json({ ...state, options: GEMINI_MODEL_OPTIONS });
};

/** PUT /api/admin/model — switch every LLM call, for every accountant and client, to this model. */
export const adminSetModel: RequestHandler = async (req, res) => {
  const parsed = ModelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Unknown model.' });
    return;
  }
  await saveGeminiModel(parsed.data.model);
  logger.info('gemini model changed', { adminUserId: req.realUserId, model: parsed.data.model });
  const state = await getGeminiModelState();
  res.json({ ...state, options: GEMINI_MODEL_OPTIONS });
};

/** GET /api/admin/whitelist — every whitelisted email, newest first. */
export const adminListWhitelist: RequestHandler = async (_req, res) => {
  const entries = await whitelist.listAll();
  res.json({
    entries: entries.map((e) => ({
      email: e.email,
      name: e.name,
      tier: e.tier,
      signedUp: e.signed_up,
      createdAt: e.created_at,
    })),
  });
};

/** POST /api/admin/whitelist — grant a paying accountant access by email. */
export const adminAddToWhitelist: RequestHandler = async (req, res) => {
  const parsed = WhitelistAddSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  if (isAdminEmail(email)) {
    res.status(400).json({ error: 'Admin accounts already have access.' });
    return;
  }
  const entry = await whitelist.add(email, parsed.data.name ?? null, parsed.data.tier ?? 'normal');
  if (!entry) {
    res.status(409).json({ error: 'This email is already whitelisted.' });
    return;
  }
  logger.info('whitelist entry added', { adminUserId: req.realUserId, email, tier: entry.tier });
  res.status(201).json({ entry: { email: entry.email, name: entry.name, tier: entry.tier, createdAt: entry.created_at } });
};

const TierSchema = z.object({ tier: z.enum(['normal', 'premium']) }).strict();

/** PUT /api/admin/whitelist/:email/tier — change an account's tier (e.g. a manual premium upgrade). */
export const adminSetTier: RequestHandler = async (req, res) => {
  const email = z.string().email().safeParse(req.params.email);
  const parsed = TierSchema.safeParse(req.body);
  if (!email.success || !parsed.success) {
    res.status(400).json({ error: 'Invalid tier change.' });
    return;
  }
  if (!(await whitelist.setTier(email.data, parsed.data.tier))) {
    res.status(404).json({ error: 'Email not found in the whitelist.' });
    return;
  }
  logger.info('account tier changed', {
    adminUserId: req.realUserId,
    email: email.data.toLowerCase(),
    tier: parsed.data.tier,
  });
  res.json({ ok: true });
};

/** DELETE /api/admin/whitelist/:email — revoke access; takes effect on their next request. */
export const adminRemoveFromWhitelist: RequestHandler = async (req, res) => {
  const email = z.string().email().safeParse(req.params.email);
  if (!email.success || !(await whitelist.remove(email.data))) {
    res.status(404).json({ error: 'Email not found in the whitelist.' });
    return;
  }
  logger.info('whitelist entry removed', { adminUserId: req.realUserId, email: email.data.toLowerCase() });
  res.json({ ok: true });
};
