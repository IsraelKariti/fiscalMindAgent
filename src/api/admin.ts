import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import * as anomalyAlerts from '../db/queries/anomalyAlerts.js';
import * as auditEvents from '../db/queries/auditEvents.js';
import * as llmUsage from '../db/queries/llmUsage.js';
import * as users from '../db/queries/users.js';
import * as waSenders from '../db/queries/waSenders.js';
import * as whitelist from '../db/queries/whitelist.js';
import { getAgentType, getAgentTypeIfKnown, listAgentTypes } from '../agents/registry.js';
import { getKillSwitchState, setKillSwitch } from '../agents/killSwitch.js';
import { defaultTaxYear } from '../agents/shared/taxYear.js';
import { RESERVED } from './mailbox.js';
import { env } from '../config/env.js';
import { getPricingForModel } from '../gemini/pricing.js';
import {
  GEMINI_MODEL_OPTIONS,
  getGeminiModelState,
  saveGeminiModel,
} from '../gemini/modelSettings.js';
import { auditAdminMutation } from '../audit/adminAudit.js';
import { logger } from '../util/logger.js';
import { clearImpersonationCookie, setImpersonationCookie } from './auth.js';

const ImpersonateSchema = z.object({ userId: z.string().uuid() }).strict();

const ModelSchema = z.object({ model: z.enum(GEMINI_MODEL_OPTIONS) }).strict();

const KillSwitchSchema = z.object({ on: z.boolean() }).strict();

const WhitelistAddSchema = z
  .object({
    email: z.string().email().max(320),
    name: z.string().min(1).max(200).nullable().optional(),
    hebrewName: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();

const WhitelistHebrewNameSchema = z
  .object({ hebrewName: z.string().min(1).max(200).nullable() })
  .strict();

/**
 * Gates the admin endpoints on the REAL signed-in user (req.realUserId), so
 * they keep working — notably stop-impersonation — while impersonating.
 * Every admin route passes through here, which makes it the single hook that
 * writes mutating admin calls to the audit trail (auditAdminMutation).
 */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    const user = await users.getById(req.realUserId!);
    if (!user || !user.is_admin) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    auditAdminMutation(req, res);
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
 * not here. Admin accounts (users.is_admin) are not accountants and are
 * excluded.
 */
export const adminListAccountants: RequestHandler = async (_req, res) => {
  const [list, usageRows, instances] = await Promise.all([
    users.listAll(),
    llmUsage.listAll(),
    agentInstances.listAllWithClientCounts(),
  ]);

  const known = knownAgentTypes();
  const agentsByUser = new Map<string, object[]>();
  for (const instance of instances) {
    // Instances of retired agent types keep their rows (never deleted —
    // clients cascade off them) but are gone from the platform: hide them.
    if (!known.has(instance.agent_type)) continue;
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
      .filter((u) => !u.is_admin)
      .map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        hebrewName: u.hebrew_name,
        createdAt: u.created_at,
        mailbox: u.mailbox_address,
        whitelisted: u.whitelisted,
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

const TaxYearSchema = z.number().int().min(2000).max(2100);

const AgentEnableSchema = z
  .object({ agentType: z.string().min(1), emailLocalPart: z.string().optional(), taxYear: TaxYearSchema.optional() })
  .strict();

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
  // Retired-type instances keep their rows but are hidden and not re-enableable.
  const instances = (await agentInstances.listAllForUser(userId.data)).filter((i) => knownAgentTypes().has(i.agent_type));
  const senders = await waSenders.listForUser(userId.data);
  const numberByInstance = new Map(senders.map((s) => [s.agent_instance_id, s.phone_number]));
  const instanceMailboxes = await agentMailboxes.listForInstancesOfUser(userId.data);
  const emailByInstance = new Map(instanceMailboxes.map((m) => [m.agent_instance_id, m.email_address]));
  const accountMailbox = await agentMailboxes.getByUserId(userId.data);
  res.json({
    agents: instances.map((i) => {
      // The derived default shown in the admin's address input for agents
      // that don't have an address yet (null when the type doesn't email
      // clients or the accountant hasn't claimed a mailbox).
      const def = getAgentType(i.agent_type);
      const suffix = def.emailSuffix;
      return {
        id: i.id,
        agentType: i.agent_type,
        name: i.name,
        enabled: i.enabled,
        waPhoneNumber: numberByInstance.get(i.id) ?? null,
        emailAddress: emailByInstance.get(i.id) ?? null,
        suggestedEmailLocalPart: suffix && accountMailbox ? `${accountMailbox.local_part}-${suffix}` : null,
        emailCapable: Boolean(suffix),
        taxYearCapable: Boolean(def.collectsTaxYear),
        taxYear: i.tax_year,
      };
    }),
    availableTypes: [...knownAgentTypes()],
    // Per-type email facts for types with no instance yet — first activation
    // happens before an instance exists, and it must collect an address then.
    emailInfoByType: Object.fromEntries(
      listAgentTypes().map((d) => [
        d.id,
        {
          emailCapable: Boolean(d.emailSuffix),
          suggestedEmailLocalPart:
            d.emailSuffix && accountMailbox ? `${accountMailbox.local_part}-${d.emailSuffix}` : null,
          taxYearCapable: Boolean(d.collectsTaxYear),
        },
      ]),
    ),
    emailDomain: env.AGENT_EMAIL_DOMAIN,
    // Prefill for the activation modal's year input (the last concluded year).
    defaultTaxYear: defaultTaxYear(new Date()),
  });
};

// Instance addresses use the DB's widened cap (prefix + suffix), not the
// 30-char claim regex in mailbox.ts.
const INSTANCE_LOCAL_PART_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/;

/** Normalizes and validates an instance address local part; shared by enable and re-address. */
function parseInstanceLocalPart(raw: string): { localPart: string } | { status: number; error: string } {
  const localPart = raw.trim().toLowerCase();
  if (!INSTANCE_LOCAL_PART_RE.test(localPart)) {
    return { status: 400, error: 'Addresses are 3–40 characters: lowercase letters, digits and hyphens (not at the edges).' };
  }
  if (RESERVED.has(localPart)) {
    return { status: 409, error: 'That name is reserved.' };
  }
  return { localPart };
}

/**
 * POST /api/admin/accountants/:userId/agents — enable an agent type for the
 * accountant (creates or re-enables). Types that email clients cannot be
 * activated without an address: the first enable must carry `emailLocalPart`
 * (deliberately chosen by the admin with the accountant — there is no
 * auto-derivation anywhere); a re-enable keeps the instance's existing address.
 */
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

  const agentType = parsed.data.agentType;
  const existing = await agentInstances.getByTypeForUser(userId.data, agentType);
  const typeDef = getAgentType(agentType);
  const emailCapable = Boolean(typeDef.emailSuffix);
  const hasEmail = existing ? Boolean(await agentMailboxes.getByInstanceId(existing.id)) : false;

  // Year-scoped agents activate with a tax year, same deliberate-choice rule as
  // the address: the first activation must carry one; a re-enable keeps the
  // stored year unless the modal sent a new one.
  if (typeDef.collectsTaxYear && parsed.data.taxYear == null && existing?.tax_year == null) {
    res.status(400).json({ error: 'A tax year is required to activate this agent.' });
    return;
  }

  let localPart: string | null = null;
  if (emailCapable && !hasEmail) {
    if (!parsed.data.emailLocalPart?.trim()) {
      res.status(400).json({ error: 'An email address is required to activate this agent.' });
      return;
    }
    const result = parseInstanceLocalPart(parsed.data.emailLocalPart);
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    localPart = result.localPart;
  }

  const instance = await agentInstances.enableInstance(userId.data, agentType);
  if (typeDef.collectsTaxYear && parsed.data.taxYear != null && parsed.data.taxYear !== instance.tax_year) {
    await agentInstances.setTaxYear(instance.id, parsed.data.taxYear);
  }
  if (localPart) {
    try {
      await agentMailboxes.insertForInstance({
        userId: userId.data,
        agentInstanceId: instance.id,
        localPart,
        emailAddress: `${localPart}@${env.AGENT_EMAIL_DOMAIN}`,
      });
    } catch (err) {
      // Activation is email-gated: if the address can't be created, don't
      // leave a freshly enabled agent running address-less.
      if (!existing?.enabled) await agentInstances.disableInstance(userId.data, agentType);
      // 23505 = unique_violation: the address is another mailbox or instance address.
      if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'That address is already taken.' });
        return;
      }
      throw err;
    }
  }
  logger.info('agent enabled', {
    adminUserId: req.realUserId,
    userId: userId.data,
    agentType: instance.agent_type,
    emailAddress: localPart ? `${localPart}@${env.AGENT_EMAIL_DOMAIN}` : undefined,
    taxYear: parsed.data.taxYear,
  });
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

const AgentEmailSchema = z.object({ agentInstanceId: z.string().uuid(), localPart: z.string() }).strict();

/**
 * POST /api/admin/agent-emails — set or change an agent instance's sender
 * address. Changing re-addresses the existing row, so mail sent to the OLD
 * address stops routing (inbound is exact-match) — the admin UI warns before
 * calling this on an assigned agent.
 */
export const adminSetAgentEmail: RequestHandler = async (req, res) => {
  const parsed = AgentEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { agentInstanceId, localPart }.' });
    return;
  }
  const instance = await agentInstances.getById(parsed.data.agentInstanceId);
  if (!instance) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  // IfKnown: a retired type's instance row may still exist — treat it like a
  // type that doesn't email clients instead of throwing.
  if (!getAgentTypeIfKnown(instance.agent_type)?.emailSuffix) {
    res.status(400).json({ error: 'This agent type does not email clients.' });
    return;
  }

  const result = parseInstanceLocalPart(parsed.data.localPart);
  if ('error' in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const { localPart } = result;

  const emailAddress = `${localPart}@${env.AGENT_EMAIL_DOMAIN}`;
  try {
    const existing = await agentMailboxes.getByInstanceId(instance.id);
    const row = existing
      ? await agentMailboxes.updateForInstance({ agentInstanceId: instance.id, localPart, emailAddress })
      : await agentMailboxes.insertForInstance({
          userId: instance.user_id,
          agentInstanceId: instance.id,
          localPart,
          emailAddress,
        });
    logger.info('agent email address set', {
      adminUserId: req.realUserId,
      instanceId: instance.id,
      emailAddress,
      previous: existing?.email_address ?? null,
    });
    res.json({ emailAddress: row?.email_address ?? emailAddress });
  } catch (err) {
    // 23505 = unique_violation: the address is another mailbox or instance address.
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That address is already taken.' });
      return;
    }
    throw err;
  }
};

const AgentTaxYearSchema = z.object({ agentInstanceId: z.string().uuid(), taxYear: TaxYearSchema }).strict();

/**
 * POST /api/admin/agent-tax-year — set or change the tax year a year-scoped
 * agent instance collects documents for. Takes effect on the next planning
 * cycle / fetch session; already-created tax_fetch_sessions keep their year.
 */
export const adminSetAgentTaxYear: RequestHandler = async (req, res) => {
  const parsed = AgentTaxYearSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { agentInstanceId, taxYear }.' });
    return;
  }
  const instance = await agentInstances.getById(parsed.data.agentInstanceId);
  if (!instance) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  // IfKnown: a retired type's instance row may still exist.
  if (!getAgentTypeIfKnown(instance.agent_type)?.collectsTaxYear) {
    res.status(400).json({ error: 'This agent type is not scoped to a tax year.' });
    return;
  }
  const updated = await agentInstances.setTaxYear(instance.id, parsed.data.taxYear);
  logger.info('agent tax year set', {
    adminUserId: req.realUserId,
    instanceId: instance.id,
    taxYear: parsed.data.taxYear,
    previous: instance.tax_year,
  });
  res.json({ taxYear: updated?.tax_year ?? parsed.data.taxYear });
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
  if (target.is_admin) {
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

/** GET /api/admin/kill-switch — is the platform-wide emergency stop on. */
export const adminGetKillSwitch: RequestHandler = async (_req, res) => {
  res.json(await getKillSwitchState());
};

/** PUT /api/admin/kill-switch — flip the org-wide off switch for every agent at once. */
export const adminSetKillSwitch: RequestHandler = async (req, res) => {
  const parsed = KillSwitchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { on: boolean }.' });
    return;
  }
  await setKillSwitch(parsed.data.on);
  logger.warn('platform kill switch changed', { adminUserId: req.realUserId, on: parsed.data.on });
  res.json(await getKillSwitchState());
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

const AuditQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

/**
 * GET /api/admin/audit-events?days=N&limit=M — the newest audit rows of the
 * last N days. Raw cube, one endpoint: the audit page filters/groups
 * client-side, like the LLM-usage page.
 */
export const adminAuditEvents: RequestHandler = async (req, res) => {
  const parsed = AuditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid range.' });
    return;
  }
  const since = new Date(Date.now() - parsed.data.days * 86_400_000);
  const rows = await auditEvents.listSince(since, parsed.data.limit);
  res.json({
    events: rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at,
      actorType: r.actor_type,
      actorEmail: r.actor_email,
      agentInstanceId: r.agent_instance_id,
      agentType: r.agent_type,
      instanceName: r.instance_name,
      clientId: r.client_id,
      clientName: r.client_name,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      severity: r.severity,
      suspectedInjection: r.suspected_injection,
      detail: r.detail,
    })),
  });
};

function alertJson(a: anomalyAlerts.AnomalyAlertRow) {
  return {
    id: a.id,
    createdAt: a.created_at,
    rule: a.rule,
    scopeKey: a.scope_key,
    severity: a.severity,
    title: a.title,
    detail: a.detail,
    status: a.status,
    notifiedAt: a.notified_at,
    ackedAt: a.acked_at,
  };
}

/** GET /api/admin/alerts — recent (30d) + all still-open anomaly alerts, and the open count for the dashboard badge. */
export const adminListAlerts: RequestHandler = async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [alerts, openCount] = await Promise.all([anomalyAlerts.listSince(since), anomalyAlerts.countOpen()]);
  res.json({ alerts: alerts.map(alertJson), openCount });
};

/** POST /api/admin/alerts/:id/ack — mark an open alert as seen/handled. */
export const adminAckAlert: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const alert = id.success ? await anomalyAlerts.ack(id.data, req.realUserId!) : null;
  if (!alert) {
    res.status(404).json({ error: 'Alert not found or already acknowledged.' });
    return;
  }
  res.json({ alert: alertJson(alert) });
};

/** GET /api/admin/whitelist — every whitelisted email, newest first. */
export const adminListWhitelist: RequestHandler = async (_req, res) => {
  const entries = await whitelist.listAll();
  res.json({
    entries: entries.map((e) => ({
      email: e.email,
      name: e.name,
      hebrewName: e.hebrew_name,
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
  if (await users.isAdminEmailInDb(email)) {
    res.status(400).json({ error: 'Admin accounts already have access.' });
    return;
  }
  const entry = await whitelist.add(email, parsed.data.name ?? null, parsed.data.hebrewName ?? null);
  if (!entry) {
    res.status(409).json({ error: 'This email is already whitelisted.' });
    return;
  }
  logger.info('whitelist entry added', { adminUserId: req.realUserId, email });
  res.status(201).json({
    entry: { email: entry.email, name: entry.name, hebrewName: entry.hebrew_name, createdAt: entry.created_at },
  });
};

/**
 * PATCH /api/admin/whitelist/:email — set the Hebrew name agents sign with.
 * Lives on the whitelist entry, so it can be edited before first sign-in and
 * survives the Google profile re-sync.
 */
export const adminSetWhitelistHebrewName: RequestHandler = async (req, res) => {
  const email = z.string().email().safeParse(req.params.email);
  const parsed = WhitelistHebrewNameSchema.safeParse(req.body);
  if (!email.success || !parsed.success) {
    res.status(400).json({ error: 'Enter a valid Hebrew name.' });
    return;
  }
  if (!(await whitelist.setHebrewName(email.data, parsed.data.hebrewName))) {
    res.status(404).json({ error: 'Email not found in the whitelist.' });
    return;
  }
  logger.info('whitelist hebrew name set', { adminUserId: req.realUserId, email: email.data.toLowerCase() });
  res.json({ ok: true });
};

const AdminGrantSchema = z.object({ email: z.string().email().max(320) }).strict();

/** GET /api/admin/admins — everyone with admin access, oldest first. */
export const adminListAdmins: RequestHandler = async (_req, res) => {
  const admins = await users.listAdmins();
  res.json({
    admins: admins.map((a) => ({ id: a.id, email: a.email, name: a.name, createdAt: a.created_at })),
  });
};

/**
 * POST /api/admin/admins — grant admin access to an existing account by email.
 * The account must have signed in at least once (there is no invite flow);
 * granting an unknown email would otherwise hand admin power to whoever
 * registers it later.
 */
export const adminGrantAdmin: RequestHandler = async (req, res) => {
  const parsed = AdminGrantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  if (await users.isAdminEmailInDb(email)) {
    res.status(409).json({ error: 'This account is already an admin.' });
    return;
  }
  const user = await users.setAdminByEmail(email, true);
  if (!user) {
    res.status(404).json({ error: 'No account with this email — they must sign in once first.' });
    return;
  }
  logger.warn('admin access granted', { adminUserId: req.realUserId, targetUserId: user.id, targetEmail: user.email });
  res.status(201).json({ admin: { id: user.id, email: user.email, name: user.name, createdAt: user.created_at } });
};

/** DELETE /api/admin/admins/:userId — revoke admin access; never your own, never the last admin's. */
export const adminRevokeAdmin: RequestHandler = async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  if (!userId.success) {
    res.status(404).json({ error: 'Admin not found.' });
    return;
  }
  if (userId.data === req.realUserId) {
    res.status(400).json({ error: 'You cannot revoke your own admin access.' });
    return;
  }
  const target = await users.getById(userId.data);
  if (!target || !target.is_admin) {
    res.status(404).json({ error: 'Admin not found.' });
    return;
  }
  if ((await users.countAdmins()) <= 1) {
    res.status(409).json({ error: 'Cannot remove the last admin.' });
    return;
  }
  await users.setAdminById(userId.data, false);
  logger.warn('admin access revoked', { adminUserId: req.realUserId, targetUserId: target.id, targetEmail: target.email });
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
