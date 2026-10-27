/**
 * The read-only rule for staff viewers (openspec `accountant-employee-access`).
 * Pure: the middleware in auth.ts applies it to req.method / req.path.
 *
 * A viewer may only READ the accountant's agent workspace: GET /agents and
 * GET /agents/<anything> (clients, conversation, files, dashboard, SSE,
 * downloads). Every other request — any write, the account-level routes
 * (connections, mailbox, the staff list itself) and the admin panel — is
 * refused. Route paths are as seen by the /api router (no "/api" prefix).
 */
export function viewerMayRequest(method: string, path: string): boolean {
  if (method.toUpperCase() !== 'GET') return false;
  return path === '/agents' || path.startsWith('/agents/');
}

export const READ_ONLY_ERROR = { error: 'Access is read-only.', code: 'read_only' } as const;
