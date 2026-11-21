import type { KickoffBlockedReason } from '../../db/queries/clients.js';
import type { StoredTaxAdvisor } from './taxAdvisor.js';

/**
 * The kickoff gate (openspec `client-tax-advisor`, "A client without a tax
 * advisor is not started"): a declaration client is only started when its
 * board row resolved to an advisor with an email address — the person the
 * decline acknowledgement names and whose address the client is sent to.
 * Pure rules over the resolved advisor, plus the refusal routine over
 * injected collaborators so tests load no database.
 */

export type { KickoffBlockedReason };

/**
 * Why the advisor read at kickoff does not pass, or null when it does.
 * `undefined` = the board maps no advisor column, `null` = the cell was
 * empty, an advisor without an email = the monday users lookup was not
 * possible (token without users:read). The staff-list match does not matter:
 * the gate is about having a person with an address.
 */
export function kickoffBlockReason(advisor: StoredTaxAdvisor | null | undefined): KickoffBlockedReason | null {
  if (advisor === undefined) return 'advisor_column_unmapped';
  if (advisor === null) return 'advisor_cell_empty';
  if (!advisor.email?.trim()) return 'advisor_email_unavailable';
  return null;
}

/** What the accountant reads in the trace for each reason. */
export const KICKOFF_BLOCKED_NOTE: Record<KickoffBlockedReason, string> = {
  advisor_column_unmapped: 'the board maps no tax advisor column',
  advisor_cell_empty: 'advisor cell empty',
  advisor_email_unavailable: "the advisor's email could not be read (reconnect monday for users:read)",
};

/** The collaborators of refuseKickoffWith — the real ones in mondayKickoffRoute.ts, stubs in tests. */
export interface RefuseKickoffDeps {
  setKickoffBlocked: (clientId: string, reason: KickoffBlockedReason) => Promise<void>;
  recordAudit: (entry: {
    actorType: 'accountant';
    actorUserId: string;
    action: 'client.kickoff_refused';
    agentInstanceId: string;
    clientId: string;
    detail: Record<string, unknown>;
  }) => void;
  publishClientUpdated: (clientId: string) => void;
}

/**
 * The refusal: stamp the reason on the client (the header badge), record it
 * on the trace, and tell the workspace. Nothing is drafted — the caller
 * returns before the audit / form intake / first draft steps. The client is
 * already enrolled and remembers its row, so a later click finds it.
 */
export async function refuseKickoffWith(
  target: { client: { id: string; name: string }; instanceId: string; accountantUserId: string; boardId: string; itemId: string },
  reason: KickoffBlockedReason,
  deps: RefuseKickoffDeps,
): Promise<void> {
  await deps.setKickoffBlocked(target.client.id, reason);
  deps.recordAudit({
    actorType: 'accountant',
    actorUserId: target.accountantUserId,
    action: 'client.kickoff_refused',
    agentInstanceId: target.instanceId,
    clientId: target.client.id,
    detail: { clientName: target.client.name, reason, note: KICKOFF_BLOCKED_NOTE[reason], boardId: target.boardId, itemId: target.itemId, source: 'monday_webhook' },
  });
  deps.publishClientUpdated(target.client.id);
}
