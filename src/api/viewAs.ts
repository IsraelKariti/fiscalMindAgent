import type { Request } from 'express';

/**
 * True while an admin views the workspace as an accountant: requireAuth sets
 * req.userId to the accountant and req.realUserId to the admin, and they
 * differ exactly then. The monday transport sets both to the same user, so it
 * never counts as viewing as. A staff viewer (openspec
 * `accountant-employee-access`) also has differing ids but is NOT viewing as:
 * they see exactly the accountant's roster. Gates the admin-only reads of
 * deleted clients (openspec `soft-delete-clients`).
 */
export function isViewingAs(req: Request): boolean {
  return (
    req.viewerRole === undefined &&
    req.realUserId !== undefined &&
    req.userId !== undefined &&
    req.realUserId !== req.userId
  );
}

/**
 * The client scope of a workspace/agent-router request: the admin's view-as
 * session also reaches the admin's test clients (openspec `admin-test-client`),
 * on every route, read or write; the accountant's own session never does
 * (they answer "client not found"). Every by-id client load of those routers
 * passes this (reads add `includeDeleted` on top).
 */
export function clientScope(req: Request): { includeTest: boolean } {
  return { includeTest: isViewingAs(req) };
}
