import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as waSenders from '../db/queries/waSenders.js';
import * as waTemplates from '../db/queries/waTemplates.js';
import {
  isProvisioningConfigured,
  listOwnedNumbers,
  NumberNotOwnedError,
  provisionWhatsAppNumber,
  releaseWhatsAppNumber,
} from '../twilio/provision.js';
import { isTwilioConfigured } from '../twilio/client.js';
import { normalizeE164 } from '../util/phone.js';
import { logger } from '../util/logger.js';

const SenderUpsertSchema = z
  .object({
    agentInstanceId: z.string().uuid(),
    // Registered as a WhatsApp sender in the Twilio console first; here it is
    // only assigned to an agent instance.
    phoneNumber: z.string().min(1),
  })
  .strict();

const TemplateCreateSchema = z
  .object({
    // Twilio Content SID of an approved template.
    contentSid: z.string().regex(/^HX[0-9a-f]{32}$/i, 'Expected a Twilio Content SID (HX...).'),
    name: z.string().min(1).max(200),
    body: z.string().min(1).max(2000),
    variableCount: z.number().int().min(0).max(20),
  })
  .strict();

/** GET /api/admin/wa-senders — every agent-instance→number assignment. */
export const adminListWaSenders: RequestHandler = async (_req, res) => {
  const senders = await waSenders.listAll();
  res.json({
    senders: senders.map((s) => ({
      agentInstanceId: s.agent_instance_id,
      userId: s.user_id,
      agentType: s.agent_type,
      phoneNumber: s.phone_number,
      createdAt: s.created_at,
    })),
  });
};

/** POST /api/admin/wa-senders — assign (or reassign) an agent instance's WhatsApp sender number. */
export const adminUpsertWaSender: RequestHandler = async (req, res) => {
  const parsed = SenderUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { agentInstanceId, phoneNumber }.', details: parsed.error.flatten() });
    return;
  }
  const phoneNumber = normalizeE164(parsed.data.phoneNumber);
  if (!phoneNumber) {
    res.status(400).json({ error: 'phoneNumber must be a valid E.164 number (e.g. +972501234567).' });
    return;
  }
  if (!(await agentInstances.getById(parsed.data.agentInstanceId))) {
    res.status(404).json({ error: 'Agent instance not found.' });
    return;
  }
  try {
    const sender = await waSenders.upsertForInstance(parsed.data.agentInstanceId, phoneNumber);
    logger.info('wa sender assigned', {
      adminUserId: req.realUserId,
      agentInstanceId: sender.agent_instance_id,
      phoneNumber,
    });
    res.status(201).json({ sender: { agentInstanceId: sender.agent_instance_id, phoneNumber: sender.phone_number } });
  } catch (err) {
    // 23505 = unique_violation: the number is already assigned to another agent.
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'This number is already assigned to another agent.' });
      return;
    }
    throw err;
  }
};

const SenderProvisionSchema = z.object({ agentInstanceId: z.string().uuid() }).strict();

/**
 * POST /api/admin/wa-senders/provision — buy a Twilio number, register it as a
 * WhatsApp sender under the platform WABA, and assign it to the agent instance.
 * Synchronous: waits (up to ~1 min) for the sender to come ONLINE, so the
 * response may take a while.
 */
export const adminProvisionWaSender: RequestHandler = async (req, res) => {
  const parsed = SenderProvisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { agentInstanceId }.', details: parsed.error.flatten() });
    return;
  }
  if (!isProvisioningConfigured()) {
    res.status(503).json({
      error:
        'Number provisioning is not configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WEBHOOK_URL and TWILIO_WABA_ID.',
    });
    return;
  }
  const instance = await agentInstances.getById(parsed.data.agentInstanceId);
  if (!instance) {
    res.status(404).json({ error: 'Agent instance not found.' });
    return;
  }
  if (await waSenders.getByInstanceId(instance.id)) {
    res.status(409).json({ error: 'This agent already has a number; remove it before buying a new one.' });
    return;
  }
  let provisioned;
  try {
    provisioned = await provisionWhatsAppNumber(`fiscalmind ${instance.agent_type} ${instance.id}`);
  } catch (err) {
    logger.error('wa number provisioning failed', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Buying the number from Twilio failed.' });
    return;
  }
  const sender = await waSenders.upsertForInstance(instance.id, provisioned.phoneNumber);
  logger.info('wa sender provisioned', {
    adminUserId: req.realUserId,
    agentInstanceId: instance.id,
    phoneNumber: provisioned.phoneNumber,
    senderStatus: provisioned.senderStatus,
  });
  res.status(201).json({
    sender: { agentInstanceId: sender.agent_instance_id, phoneNumber: sender.phone_number },
    senderStatus: provisioned.senderStatus,
  });
};

/** DELETE /api/admin/wa-senders/:agentInstanceId — unassign the agent instance's number. */
export const adminDeleteWaSender: RequestHandler = async (req, res) => {
  const instanceId = z.string().uuid().safeParse(req.params.agentInstanceId);
  if (!instanceId.success || !(await waSenders.getByInstanceId(instanceId.data))) {
    res.status(404).json({ error: 'No WhatsApp sender assigned to this agent instance.' });
    return;
  }
  await waSenders.deleteForInstance(instanceId.data);
  logger.info('wa sender unassigned', { adminUserId: req.realUserId, agentInstanceId: instanceId.data });
  res.json({ ok: true });
};

/**
 * GET /api/admin/wa-numbers/orphaned — numbers the Twilio account owns (and is
 * billed monthly for) that are not assigned to any agent instance.
 */
export const adminListOrphanedWaNumbers: RequestHandler = async (_req, res) => {
  if (!isTwilioConfigured()) {
    res.status(503).json({ error: 'Twilio is not configured: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.' });
    return;
  }
  const [owned, senders] = await Promise.all([listOwnedNumbers(), waSenders.listAll()]);
  const assigned = new Set(senders.map((s) => s.phone_number));
  res.json({ numbers: owned.filter((n) => !assigned.has(n.phoneNumber)) });
};

const OrphanedReleaseSchema = z.object({ phoneNumber: z.string().min(1) }).strict();

/**
 * POST /api/admin/wa-numbers/release — permanently release an *unassigned*
 * owned number back to Twilio (assigned numbers go through the per-instance
 * release endpoint, which also clears the assignment).
 */
export const adminReleaseOrphanedWaNumber: RequestHandler = async (req, res) => {
  const parsed = OrphanedReleaseSchema.safeParse(req.body);
  const phoneNumber = parsed.success ? normalizeE164(parsed.data.phoneNumber) : null;
  if (!phoneNumber) {
    res.status(400).json({ error: 'Expected { phoneNumber } as a valid E.164 number.' });
    return;
  }
  if (!isTwilioConfigured()) {
    res.status(503).json({ error: 'Twilio is not configured: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.' });
    return;
  }
  if (await waSenders.getByPhoneNumber(phoneNumber)) {
    res.status(409).json({ error: 'This number is assigned to an agent; release it from that agent instead.' });
    return;
  }
  try {
    await releaseWhatsAppNumber(phoneNumber);
  } catch (err) {
    if (err instanceof NumberNotOwnedError) {
      res.status(404).json({ error: err.message });
      return;
    }
    logger.error('orphaned wa number release failed', err);
    res.status(502).json({ error: 'Releasing the number on Twilio failed.' });
    return;
  }
  logger.info('orphaned wa number released', { adminUserId: req.realUserId, phoneNumber });
  res.json({ ok: true });
};

/**
 * POST /api/admin/wa-senders/:agentInstanceId/release — permanently release the
 * agent instance's number back to Twilio (deregister the WhatsApp sender +
 * release the number, stopping the monthly billing), then unassign it. Unlike
 * DELETE, this destroys the number — it cannot be reassigned afterwards.
 */
export const adminReleaseWaSender: RequestHandler = async (req, res) => {
  const instanceId = z.string().uuid().safeParse(req.params.agentInstanceId);
  const sender = instanceId.success ? await waSenders.getByInstanceId(instanceId.data) : null;
  if (!sender) {
    res.status(404).json({ error: 'No WhatsApp sender assigned to this agent instance.' });
    return;
  }
  if (!isTwilioConfigured()) {
    res.status(503).json({ error: 'Twilio is not configured: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.' });
    return;
  }
  try {
    await releaseWhatsAppNumber(sender.phone_number);
  } catch (err) {
    if (err instanceof NumberNotOwnedError) {
      // Manually assigned external number — releasing it here is impossible;
      // the admin should use the plain remove (unassign) instead.
      res.status(409).json({ error: err.message });
      return;
    }
    logger.error('wa number release failed', err);
    res.status(502).json({ error: 'Releasing the number on Twilio failed.' });
    return;
  }
  await waSenders.deleteForInstance(sender.agent_instance_id);
  logger.info('wa sender released', {
    adminUserId: req.realUserId,
    agentInstanceId: sender.agent_instance_id,
    phoneNumber: sender.phone_number,
  });
  res.json({ ok: true });
};

/** GET /api/admin/wa-templates — the platform's approved Content Templates. */
export const adminListWaTemplates: RequestHandler = async (_req, res) => {
  const templates = await waTemplates.listAll();
  res.json({
    templates: templates.map((t) => ({
      id: t.id,
      contentSid: t.content_sid,
      name: t.name,
      body: t.body,
      variableCount: t.variable_count,
    })),
  });
};

/** POST /api/admin/wa-templates — register an approved Twilio Content Template. */
export const adminCreateWaTemplate: RequestHandler = async (req, res) => {
  const parsed = TemplateCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid template fields.', details: parsed.error.flatten() });
    return;
  }
  if (await waTemplates.getByContentSid(parsed.data.contentSid)) {
    res.status(409).json({ error: 'A template with this Content SID already exists.' });
    return;
  }
  const template = await waTemplates.insert(parsed.data);
  logger.info('wa template added', { adminUserId: req.realUserId, contentSid: template.content_sid });
  res.status(201).json({
    template: {
      id: template.id,
      contentSid: template.content_sid,
      name: template.name,
      body: template.body,
      variableCount: template.variable_count,
    },
  });
};

/** DELETE /api/admin/wa-templates/:id — remove a template from the agent's options. */
export const adminDeleteWaTemplate: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(404).json({ error: 'Template not found.' });
    return;
  }
  await waTemplates.remove(id.data);
  res.json({ ok: true });
};
