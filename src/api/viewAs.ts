import type { Request } from 'express';

/**
 * True while an admin views the workspace as an accountant: requireAuth sets
 * req.userId to the accountant and req.realUserId to the admin, and they
 * differ exactly then. The monday transport sets both to the same user, so it
 * never counts as viewing as. Gates the admin-only reads of deleted clients
 * (openspec `soft-delete-clients`).
 */
export function isViewingAs(req: Request): boolean {
  return req.realUserId !== undefined && req.userId !== undefined && req.realUserId !== req.userId;
}
