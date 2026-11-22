import * as clients from '../db/queries/clients.js';
import { recordAudit } from '../audit/audit.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { isProviderHeld, type ProviderHeldError } from '../gemini/providerOutage.js';
import { logger } from '../util/logger.js';
import type { ClientRow } from '../db/types.js';

/** What of the client's work stopped on the hold (the trace step names it). */
export type HeldWork = 'message' | 'file' | 'planner' | 'verification';

/**
 * A client's work stopped on a provider outage hold (openspec
 * `llm-provider-outage`): the client is marked held — not draft-failed, not
 * paused — so the workspace shows "waiting for the system" and the recovery
 * re-plans it. The first held item of a turn writes the one `outage.held`
 * trace step (admin-visible, names the provider and the reason kind); later
 * items of the same hold find the marker set and add nothing.
 */
export async function holdClientForOutage(
  client: ClientRow,
  err: ProviderHeldError,
  held: { what: HeldWork; targetType?: 'email' | 'document_file'; targetId?: string },
): Promise<void> {
  const first = await clients.markOutageHeld(client.id, err.provider);
  logger.warn('client work held by a provider outage', {
    clientId: client.id,
    provider: err.provider,
    kind: err.kind,
    held: held.what,
    targetId: held.targetId ?? null,
    firstOfHold: first,
  });
  if (first) {
    recordAudit({
      actorType: 'system',
      action: 'outage.held',
      severity: 'warning',
      agentInstanceId: client.agent_instance_id,
      clientId: client.id,
      targetType: held.targetType ?? null,
      targetId: held.targetId ?? null,
      detail: { clientName: client.name, provider: err.provider, kind: err.kind, held: held.what, error: err.message.slice(0, 600) },
    });
  }
  publishClientUpdated(client.id);
}

export { isProviderHeld };
