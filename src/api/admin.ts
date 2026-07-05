import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as users from '../db/queries/users.js';
import * as whitelist from '../db/queries/whitelist.js';
import { getLlmPricing } from '../gemini/pricing.js';
import { logger } from '../util/logger.js';
import { clearImpersonationCookie, isAdminEmail, setImpersonationCookie } from './auth.js';

const ImpersonateSchema = z.object({ userId: z.string().uuid() }).strict();

const WhitelistAddSchema = z
  .object({
    email: z.string().email().max(320),
    name: z.string().min(1).max(200).nullable().optional(),
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
 * GET /api/admin/accountants — every accountant with their collection progress,
 * for the admin dashboard, plus the current Gemini token prices (null while the
 * pricing registry is unreachable). Admin accounts (ADMIN_EMAILS) are not
 * accountants and are excluded.
 */
export const adminListAccountants: RequestHandler = async (_req, res) => {
  const [list, pricing] = await Promise.all([users.listAll(), getLlmPricing()]);
  res.json({
    pricing,
    accountants: list
      .filter((u) => !isAdminEmail(u.email))
      .map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.created_at,
        mailbox: u.mailbox_address,
        whitelisted: u.whitelisted,
        clientCount: u.client_count,
        clientsComplete: u.clients_complete,
        docsTotal: u.docs_total,
        docsCollected: u.docs_collected,
        llmInputTokens: u.llm_input_tokens,
        llmOutputTokens: u.llm_output_tokens,
        llmThinkingTokens: u.llm_thinking_tokens,
      })),
  });
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

/** GET /api/admin/whitelist — every whitelisted email, newest first. */
export const adminListWhitelist: RequestHandler = async (_req, res) => {
  const entries = await whitelist.listAll();
  res.json({
    entries: entries.map((e) => ({
      email: e.email,
      name: e.name,
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
  const entry = await whitelist.add(email, parsed.data.name ?? null);
  if (!entry) {
    res.status(409).json({ error: 'This email is already whitelisted.' });
    return;
  }
  logger.info('whitelist entry added', { adminUserId: req.realUserId, email });
  res.status(201).json({ entry: { email: entry.email, name: entry.name, createdAt: entry.created_at } });
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
