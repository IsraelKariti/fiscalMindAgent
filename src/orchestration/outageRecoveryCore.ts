import { logger } from '../util/logger.js';
import type { AgentContext } from '../agents/types.js';
import type { ClientRow, DocumentFileRow, EmailRow } from '../db/types.js';
import type { OutageProvider } from '../gemini/outageRules.js';

/**
 * The pure core of the recovery after a provider outage hold (openspec
 * `llm-provider-outage`): the order of the work per client, driven through
 * injected deps so the rules are testable without a database, Redis or a
 * provider. The real wiring lives in outageRecovery.ts.
 *
 * Once the probe gets an answer, every held client's work is re-run in
 * order — the messages waiting for their safety check are screened, the
 * held files analyzed from their stored bytes, the collected documents whose
 * verification was cut short verified — and then the client's deferred
 * planner run is requested under the normal turn rules, so the client gets
 * one reply for everything sent during the hold. A client whose state no
 * longer allows a plan (complete, paused) only loses its marker. Sequential
 * per client, so a recovering provider is not stormed. An item that hits a
 * hold again stays held (the runner reopens the hold) and the client keeps
 * its marker for the next recovery.
 */
export interface RecoveryCounts {
  clients: number;
  messages: number;
  files: number;
}

export interface RecoveryAgent {
  rescreen: (row: EmailRow) => Promise<void>;
  reanalyze: (file: DocumentFileRow) => Promise<void>;
  reverify: () => Promise<void>;
}

/** What the recovery needs from the world; the real wiring is outageRecovery.ts `realRecoveryDeps`, tests pass stubs. */
export interface RecoveryDeps {
  heldClients(provider: OutageProvider): Promise<ClientRow[]>;
  getClient(id: string): Promise<ClientRow | null>;
  loadAgent(client: ClientRow): Promise<(AgentContext & RecoveryAgent) | RecoveryAgent>;
  pendingMessages(clientId: string): Promise<EmailRow[]>;
  heldFiles(clientId: string): Promise<DocumentFileRow[]>;
  inFlight<T>(clientId: string, fn: () => Promise<T>): Promise<T>;
  /** The hold reopened while this client was being recovered (the item is still held). */
  stillHeld(provider: OutageProvider): Promise<boolean>;
  clearClientHeld(clientId: string): Promise<void>;
  requestReplan(clientId: string): Promise<void>;
}

export function createOutageRecovery(deps: RecoveryDeps) {
  return async function recoverFromOutage(provider: OutageProvider): Promise<RecoveryCounts> {
    const counts: RecoveryCounts = { clients: 0, messages: 0, files: 0 };
    for (const held of await deps.heldClients(provider)) {
      try {
        const client = await deps.getClient(held.id);
        if (!client) continue;
        if (client.goal_status !== 'pending' || client.paused) {
          // Nothing to plan any more: the marker goes, the held items stay as they are.
          await deps.clearClientHeld(client.id);
          continue;
        }
        const agent = await deps.loadAgent(client);
        for (const row of await deps.pendingMessages(client.id)) {
          await deps.inFlight(client.id, () => agent.rescreen(row));
          counts.messages += 1;
        }
        for (const file of await deps.heldFiles(client.id)) {
          await deps.inFlight(client.id, () => agent.reanalyze(file));
          counts.files += 1;
        }
        await agent.reverify();
        if (await deps.stillHeld(provider)) {
          logger.warn('provider hold reopened during the recovery — the client stays held', { clientId: client.id, provider });
          return counts;
        }
        await deps.clearClientHeld(client.id);
        await deps.requestReplan(client.id);
        counts.clients += 1;
      } catch (err) {
        logger.error('outage recovery failed for client', err, { clientId: held.id, provider });
      }
    }
    return counts;
  };
}
