import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import * as waSenders from '../db/queries/waSenders.js';
import { loadAgentContext } from '../agents/resolve.js';
import { getGeminiModel, resolveBackupModel } from '../gemini/modelSettings.js';
import { providerForModel } from '../gemini/modelCatalog.js';
import { getHolds, getHoldsFresh, noteProbeFailure, releaseHold, reportRecovered } from '../gemini/providerOutage.js';
import { heldProviders, holdOldEnoughToAcknowledge, routeUnderHold, type OutageProvider, type ProviderHold } from '../gemini/outageRules.js';
import { probeProvider, type ProbeResult } from '../gemini/outageProbe.js';
import { withInboundInFlight } from './inboundTurn.js';
import { requestReplan } from './requestReplan.js';
import { isWhatsAppWindowOpen } from './whatsappWindow.js';
import { sendWhatsAppTextAndRecord } from '../twilio/sendAndRecord.js';
import { downloadBlob } from '../storage/blob.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import { createOutageRecovery, type RecoveryCounts, type RecoveryDeps } from './outageRecoveryCore.js';
import type { ClientRow, DocumentFileRow, EmailRow } from '../db/types.js';
import type { Readable } from 'node:stream';

/**
 * The real wiring of the recovery after a provider outage hold (openspec
 * `llm-provider-outage`); the order of the work is outageRecoveryCore.ts.
 */

/** Sent verbatim, no model consulted, once per client per hold (D10). */
export const OUTAGE_ACK_HE = 'קיבלתי, תודה. יש עיכוב קצר מצידנו, אחזור אליך בהקדם.';

export { createOutageRecovery } from './outageRecoveryCore.js';
export type { RecoveryCounts, RecoveryDeps } from './outageRecoveryCore.js';

async function readBlob(blobKey: string): Promise<Buffer> {
  const stream: Readable = (await downloadBlob(blobKey)).stream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export const realRecoveryDeps: RecoveryDeps = {
  heldClients: (provider) => clients.listOutageHeld(provider),
  getClient: (id) => clients.getById(id),
  async loadAgent(client) {
    const agent = await loadAgentContext(client);
    const { definition } = agent;
    return {
      ...agent,
      rescreen: async (row) => {
        if (definition.rescreenInboundMessage) await definition.rescreenInboundMessage(agent, row);
      },
      reanalyze: async (file) => {
        if (!definition.analyzeInboundFile) return;
        await definition.analyzeInboundFile(agent, file, await readBlob(file.blob_key));
      },
      reverify: async () => {
        if (definition.reverifyCollected) await definition.reverifyCollected(agent);
      },
    };
  },
  pendingMessages: async (clientId) => (await emails.listScreenPending()).filter((r) => r.client_id === clientId),
  heldFiles: async (clientId) => (await documentFiles.listOutageHeld()).filter((f) => f.client_id === clientId && f.parent_file_id === null),
  inFlight: (clientId, fn) => withInboundInFlight(clientId, fn),
  stillHeld: async (provider) => (await getHoldsFresh())[provider] !== undefined,
  clearClientHeld: (clientId) => clients.clearOutageHeld(clientId),
  requestReplan: (clientId) => requestReplan(clientId),
};

export const recoverFromOutage = createOutageRecovery(realRecoveryDeps);

/**
 * Whether the planner stage can run right now under the open holds: its
 * primary's provider is held and no backup on a free provider exists, or the
 * budget hold is open. The deferred turn waits instead of running into the
 * refusal.
 */
export async function plannerHeld(): Promise<boolean> {
  const holds = await getHolds();
  if (Object.keys(holds).length === 0) return false;
  const primary = await getGeminiModel('planner');
  const backup = await resolveBackupModel('planner', primary);
  return routeUnderHold(holds, providerForModel(primary), backup ? providerForModel(backup) : null).route === 'held';
}

export type ProbeOutcome = { provider: OutageProvider; result: 'recovered'; recovered: RecoveryCounts } | { provider: OutageProvider; result: 'still_failing'; error: string };

/**
 * One probe round over every open hold (the worker's tick and the admin's
 * "retry now"): a provider that answers has its hold released first (the
 * recovery's own calls must pass the hold check), then its held work is
 * recovered and the recovered alert names the counts; a provider that still
 * fails keeps its hold with the new error and time, and no new alert.
 */
export async function probeAllHolds(): Promise<ProbeOutcome[]> {
  const holds = await getHoldsFresh();
  const outcomes: ProbeOutcome[] = [];
  for (const provider of heldProviders(holds)) {
    const hold = holds[provider] as ProviderHold;
    const result: ProbeResult = await probeProvider(provider, hold);
    if (!result.ok) {
      await noteProbeFailure(provider, result.error);
      outcomes.push({ provider, result: 'still_failing', error: result.error });
      continue;
    }
    await releaseHold(provider);
    const recovered = await recoverFromOutage(provider);
    await reportRecovered(provider, recovered);
    outcomes.push({ provider, result: 'recovered', recovered });
  }
  return outcomes;
}

/**
 * The one calm acknowledgement (D10): once a hold has lasted the configured
 * delay, every client who wrote during it (a message or file still waiting)
 * and has not been acknowledged gets the fixed line, over WhatsApp, inside
 * the open window, once per hold. 0 disables it.
 */
export async function acknowledgeHeldClients(now = new Date()): Promise<number> {
  const delay = env.LLM_OUTAGE_ACK_AFTER_SECONDS;
  if (delay <= 0) return 0;
  const holds = await getHoldsFresh();
  const old = heldProviders(holds).filter((p) => holdOldEnoughToAcknowledge(holds[p] as ProviderHold, now, delay));
  if (old.length === 0) return 0;
  let sent = 0;
  for (const client of await clients.listOutageHeld()) {
    if (client.outage_ack_sent_at || !client.wa_phone || !client.agent_instance_id) continue;
    if (!old.includes(client.outage_held_provider as OutageProvider)) continue;
    const wrote = (await emails.countScreenPendingForClient(client.id)) > 0 || (await documentFiles.countOutageHeldForClient(client.id)) > 0;
    if (!wrote) continue;
    if (!(await isWhatsAppWindowOpen(client.id, now))) continue;
    const sender = await waSenders.getByInstanceId(client.agent_instance_id);
    if (!sender) continue;
    if (!(await clients.markOutageAckSent(client.id))) continue;
    try {
      await sendWhatsAppTextAndRecord(client.id, {
        from: sender.phone_number,
        to: client.wa_phone,
        body: OUTAGE_ACK_HE,
        reasoning: 'provider outage: fixed acknowledgement, no model consulted',
        agentInstanceId: client.agent_instance_id,
      });
      sent += 1;
    } catch (err) {
      logger.error('outage acknowledgement failed', err, { clientId: client.id });
    }
  }
  if (sent > 0) logger.info('outage acknowledgements sent', { sent });
  return sent;
}
