import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as waBusinessAccounts from '../db/queries/waBusinessAccounts.js';
import { recordAudit } from '../audit/audit.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

/** Meta WABA ids are numeric strings. */
const WABA_ID_RE = /^[0-9]{5,20}$/;

const ConnectSchema = z
  .object({
    wabaId: z.string().regex(WABA_ID_RE, 'Expected a numeric WhatsApp Business Account id.'),
    source: z.enum(['embedded_signup', 'manual']),
  })
  .strict();

/**
 * GET /api/wa-business — the accountant's own WABA connection, plus the
 * Embedded Signup client config (the popup runs entirely in the browser via
 * the Facebook JS SDK, so the frontend needs the app + config ids).
 */
export const waBusinessStatus: RequestHandler = async (req, res) => {
  const account = await waBusinessAccounts.getByUserId(req.userId!);
  const embeddedSignupConfigured = Boolean(env.META_APP_ID && env.META_ES_CONFIG_ID);
  res.json({
    connected: account !== null,
    wabaId: account?.waba_id ?? null,
    source: account?.source ?? null,
    connectedAt: account?.connected_at ?? null,
    embeddedSignup: embeddedSignupConfigured
      ? { configured: true, appId: env.META_APP_ID!, configId: env.META_ES_CONFIG_ID! }
      : { configured: false },
  });
};

/**
 * POST /api/wa-business — record the accountant's own WABA. The id comes from
 * the Embedded Signup popup's session-info message, or is pasted manually
 * after the WABA was shared with Twilio in the console. From then on, number
 * provisioning for this accountant's agents registers senders under this WABA
 * instead of the platform one.
 */
export const waBusinessConnect: RequestHandler = async (req, res) => {
  const parsed = ConnectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Expected { wabaId, source }.', details: parsed.error.flatten() });
    return;
  }
  const account = await waBusinessAccounts.upsertForUser(req.userId!, parsed.data.wabaId, parsed.data.source);
  logger.info('wa business account connected', { userId: req.userId, wabaId: account.waba_id, source: account.source });
  recordAudit({
    actorType: 'accountant',
    actorUserId: req.userId,
    action: 'wa_business.connected',
    targetType: 'waba',
    targetId: account.waba_id,
    detail: { source: account.source },
  });
  res.status(201).json({ connected: true, wabaId: account.waba_id, source: account.source, connectedAt: account.connected_at });
};

/** DELETE /api/wa-business — forget the accountant's WABA; provisioning falls back to the platform WABA. */
export const waBusinessDisconnect: RequestHandler = async (req, res) => {
  const account = await waBusinessAccounts.getByUserId(req.userId!);
  await waBusinessAccounts.removeForUser(req.userId!);
  if (account) {
    logger.info('wa business account disconnected', { userId: req.userId, wabaId: account.waba_id });
    recordAudit({
      actorType: 'accountant',
      actorUserId: req.userId,
      action: 'wa_business.disconnected',
      targetType: 'waba',
      targetId: account.waba_id,
    });
  }
  res.json({ ok: true });
};
