import { logger } from '../../util/logger.js';
import type { recordAudit } from '../../audit/audit.js';
import type { ClientRow, UserRow } from '../../db/types.js';

/** Which platform notification an accountant email is (recorded as `detail.kind` on its trace row). */
export type AccountantEmailKind = 'goal_complete' | 'claimed_documents' | 'verification_problem' | 'overdue';

/** The collaborators of sendToAccountantWith — the real ones in notifyAccountant.ts, stubs in tests. */
export interface NotifyAccountantDeps {
  from: string;
  getUser: (userId: string) => Promise<Pick<UserRow, 'email'> | null>;
  sendEmail: (args: { from: string; to: string; subject: string; body: string }) => Promise<{ resendId: string }>;
  recordAudit: typeof recordAudit;
}

/**
 * Sends one platform notification to the client's accountant and records it on
 * the client's trace (openspec `conversation-trace`). Deliberately NOT stored
 * in the emails table — that table is the client conversation (it feeds the
 * timeline, the LLM transcript and the threading headers). The trace row is
 * `email.accountant_sent` with the kind, recipient, subject, body and the
 * provider id (a `blocked-` stand-in when the outbound fence stopped it), or
 * an `email.accountant_failed` warning row with the same content and the
 * error. The error is rethrown so the caller's own catch still logs it; a
 * notification failure must never fail planning or a route.
 */
export async function sendToAccountantWith(
  client: Pick<ClientRow, 'id' | 'name' | 'user_id' | 'agent_instance_id'>,
  kind: AccountantEmailKind,
  subject: string,
  body: string,
  deps: NotifyAccountantDeps,
): Promise<void> {
  if (!client.user_id) {
    logger.warn('accountant notification skipped: legacy client without owner', { clientId: client.id });
    return;
  }
  const user = await deps.getUser(client.user_id);
  if (!user) {
    logger.warn('accountant notification skipped: missing user', { clientId: client.id, userId: client.user_id });
    return;
  }
  const content = { clientName: client.name, kind, to: user.email, subject, body };
  const audit = { actorType: 'agent' as const, agentInstanceId: client.agent_instance_id, clientId: client.id, targetType: 'email' };
  let resendId: string;
  try {
    ({ resendId } = await deps.sendEmail({ from: deps.from, to: user.email, subject, body }));
  } catch (err) {
    deps.recordAudit({
      ...audit,
      action: 'email.accountant_failed',
      severity: 'warning',
      detail: { ...content, error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
  logger.info('accountant notified', { clientId: client.id, to: user.email, subject });
  deps.recordAudit({ ...audit, action: 'email.accountant_sent', detail: { ...content, resendId } });
}
