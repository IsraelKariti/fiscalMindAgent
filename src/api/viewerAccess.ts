/**
 * The access rule for staff viewers (openspec `accountant-staff-access`,
 * widened by `staff-conversation-controls`).
 * Pure: the middleware in auth.ts applies it to req.method / req.path.
 *
 * A viewer may READ the accountant's agent workspace: GET /agents and
 * GET /agents/<anything> (clients, conversation, files, dashboard, SSE,
 * downloads). A viewer may also DRIVE a client's conversation: the
 * conversation-flow routes under /agents/<id>/clients/<id>/ — pause (PUT,
 * covers pause and resume), send-now, retry-send and redraft (POST, covers
 * retry draft and regenerate). Every other request — any other write, the
 * account-level routes (connections, mailbox, the staff list itself) and the
 * admin panel — is refused. Route paths are as seen by the /api router (no
 * "/api" prefix).
 */
const CONVERSATION_FLOW_ROUTE = /^\/agents\/[^/]+\/clients\/[^/]+\/(pause|send-now|retry-send|redraft)$/;

export function viewerMayRequest(method: string, path: string): boolean {
  const verb = method.toUpperCase();
  if (verb === 'GET') return path === '/agents' || path.startsWith('/agents/');
  if (verb === 'PUT' || verb === 'POST') {
    const match = CONVERSATION_FLOW_ROUTE.exec(path);
    if (!match) return false;
    // pause is a PUT route, the other three are POST — the same verbs the accountant uses.
    return match[1] === 'pause' ? verb === 'PUT' : verb === 'POST';
  }
  return false;
}

export const READ_ONLY_ERROR = { error: 'Access is read-only.', code: 'read_only' } as const;
