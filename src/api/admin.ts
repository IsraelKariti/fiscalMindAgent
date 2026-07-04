import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as users from '../db/queries/users.js';
import { logger } from '../util/logger.js';
import { clearImpersonationCookie, isAdminEmail, setImpersonationCookie } from './auth.js';

const ImpersonateSchema = z.object({ userId: z.string().uuid() }).strict();

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

/** GET /api/admin/users — every account, for the impersonation picker. */
export const adminListUsers: RequestHandler = async (_req, res) => {
  const list = await users.listAll();
  res.json({
    users: list.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.created_at,
      clientCount: u.client_count,
    })),
  });
};

/** POST /api/admin/impersonate — start viewing the given user's dashboard. */
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
