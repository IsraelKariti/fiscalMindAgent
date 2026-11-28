import * as clients from '../../db/queries/clients.js';
import * as users from '../../db/queries/users.js';
import * as waSenders from '../../db/queries/waSenders.js';
import * as waTemplates from '../../db/queries/waTemplates.js';
import { withClientLock } from '../../db/withClientLock.js';
import { adminCommsPaused } from '../../orchestration/adminPause.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { sendWhatsAppTemplateAndRecord } from '../../twilio/sendAndRecord.js';
import { isKillSwitchOn } from '../killSwitch.js';
import { env } from '../../config/env.js';
import type { ClientRow, WaTemplateRow } from '../../db/types.js';
import { DECLARATION_OF_CAPITAL } from './agentType.js';
import {
  handoffNoticeDelivery,
  runHandoffNoticeScanWith,
  sendHandoffNoticeWith,
  type HandoffNoticeDelivery,
  type HandoffNoticeOutcome,
  type HandoffNoticeSendDeps,
} from './handoffNotice.js';

/**
 * The database and provider wiring of the handoff notice (openspec
 * `handoff-notice`). The rules live in handoffNotice.ts.
 */

/** The registered handoff template of the agent type (the first one, should several exist). */
export async function handoffTemplate(agentType: string): Promise<WaTemplateRow | null> {
  return (await waTemplates.listForAgentType(agentType)).find((t) => t.purpose === 'handoff') ?? null;
}

/** Resolves the sender, the accountant and the template, then asks the rules whether the notice can go out. */
async function resolveDelivery(client: ClientRow): Promise<HandoffNoticeDelivery> {
  const [sender, accountant, template] = await Promise.all([
    client.agent_instance_id ? waSenders.getByInstanceId(client.agent_instance_id) : null,
    client.user_id ? users.getById(client.user_id) : null,
    handoffTemplate(DECLARATION_OF_CAPITAL),
  ]);
  return handoffNoticeDelivery(client, accountant, sender, template);
}

const sendDeps: HandoffNoticeSendDeps = {
  adminPaused: (client) => adminCommsPaused(client),
  resolveDelivery,
  claim: clients.claimHandoffNotice,
  release: clients.releaseHandoffNotice,
  send: async (client, delivery) => {
    await sendWhatsAppTemplateAndRecord(client.id, {
      from: delivery.from,
      to: delivery.to,
      contentSid: delivery.contentSid,
      variables: delivery.variables,
      renderedBody: delivery.renderedBody,
      reasoning: 'handoff notice after the collection window ended',
      agentInstanceId: client.agent_instance_id,
      clientName: client.name,
    });
  },
  published: publishClientUpdated,
};

/** Sends the handoff notice to one stopped client, under the client lock. */
export function sendHandoffNotice(client: ClientRow, now: Date): Promise<HandoffNoticeOutcome> {
  return withClientLock(client.id, () => sendHandoffNoticeWith(client, now, sendDeps));
}

/** The 09:00 job: on a business day, the notice for every client stopped by the window and not yet told. */
export function runHandoffNoticeScan(now: Date = new Date()): Promise<{ due: number; sent: number }> {
  return runHandoffNoticeScanWith(now, env.ACCOUNTANT_TIMEZONE, {
    killSwitchOn: isKillSwitchOn,
    listDue: (sinceIso) => clients.listHandoffNoticeDue([DECLARATION_OF_CAPITAL], sinceIso),
    sendOne: sendHandoffNotice,
  });
}
