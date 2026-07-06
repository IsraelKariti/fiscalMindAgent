import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as users from '../db/queries/users.js';
import * as waSenders from '../db/queries/waSenders.js';
import * as waTemplates from '../db/queries/waTemplates.js';
import { normalizeE164 } from '../util/phone.js';
import { logger } from '../util/logger.js';

const SenderUpsertSchema = z
  .object({
    userId: z.string().uuid(),
    // Registered as a WhatsApp sender in the Twilio console first; here it is
    // only assigned to an accountant.
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

/** GET /api/admin/wa-senders — every accountant→number assignment. */
export const adminListWaSenders: RequestHandler = async (_req, res) => {
  const senders = await waSenders.listAll();
  res.json({
    senders: senders.map((s) => ({ userId: s.user_id, phoneNumber: s.phone_number, createdAt: s.created_at })),
  });
};

/** POST /api/admin/wa-senders — assign (or reassign) an accountant's WhatsApp sender number. */
export const adminUpsertWaSender: RequestHandler = async (req, res) => {
  const parsed = SenderUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { userId, phoneNumber }.', details: parsed.error.flatten() });
    return;
  }
  const phoneNumber = normalizeE164(parsed.data.phoneNumber);
  if (!phoneNumber) {
    res.status(400).json({ error: 'phoneNumber must be a valid E.164 number (e.g. +972501234567).' });
    return;
  }
  if (!(await users.getById(parsed.data.userId))) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  try {
    const sender = await waSenders.upsertForUser(parsed.data.userId, phoneNumber);
    logger.info('wa sender assigned', { adminUserId: req.realUserId, userId: sender.user_id, phoneNumber });
    res.status(201).json({ sender: { userId: sender.user_id, phoneNumber: sender.phone_number } });
  } catch (err) {
    // 23505 = unique_violation: the number is already assigned to another accountant.
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'This number is already assigned to another accountant.' });
      return;
    }
    throw err;
  }
};

/** DELETE /api/admin/wa-senders/:userId — unassign the accountant's number. */
export const adminDeleteWaSender: RequestHandler = async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  if (!userId.success || !(await waSenders.getByUserId(userId.data))) {
    res.status(404).json({ error: 'No WhatsApp sender assigned to this user.' });
    return;
  }
  await waSenders.deleteForUser(userId.data);
  logger.info('wa sender unassigned', { adminUserId: req.realUserId, userId: userId.data });
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

/** GET /api/wa-sender — the signed-in accountant's own WhatsApp sender number (read-only). */
export const waSenderStatus: RequestHandler = async (req, res) => {
  const sender = await waSenders.getByUserId(req.userId!);
  res.json({ assigned: sender !== null, phoneNumber: sender?.phone_number ?? null });
};
