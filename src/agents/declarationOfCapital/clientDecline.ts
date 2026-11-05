import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as emails from '../../db/queries/emails.js';
import * as waSenders from '../../db/queries/waSenders.js';
import { sendWhatsAppTextAndRecord } from '../../twilio/sendAndRecord.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { syncMondayDocumentsStatus } from '../shared/mondayStatusSync.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { recordAudit } from '../../audit/audit.js';
import { DECLARATION_OF_CAPITAL } from './agentType.js';
import { getWaChannelState } from './plan.js';
import { sendDeclinedEmail } from './notifyAccountant.js';
import { handleClientDeclineWith, type ClientDeclineOutcome, type DeclineSource } from './clientDeclineRules.js';
import type { AgentContext, InboundEvent } from '../types.js';

export { DECLINE_BUTTON_ID, DECLINE_BUTTON_TEXT, isDeclineButton } from './clientDeclineRules.js';

/**
 * A client's decline of the WhatsApp collection (openspec `client-decline`):
 * the intro template's second quick-reply button (index.ts, no planner call),
 * or a refusal in words the planner answered `client_declined` (plan.ts).
 * Both end in handleClientDecline: one fixed acknowledgement, the client
 * paused and marked declined, the pending send gone, one email to the
 * accountant. The rules live in clientDeclineRules.ts.
 */

/** The stored text of the event's message, for isDeclineButton; null when the row cannot be read. */
export async function inboundMessageBody(evt: Pick<InboundEvent, 'messageRowId'>): Promise<string | null> {
  if (!evt.messageRowId) return null;
  const row = await emails.getById(evt.messageRowId);
  return row?.body ?? null;
}

/** handleClientDeclineWith with the real collaborators. The caller holds the client lock. */
export function handleClientDecline(ctx: AgentContext, source: DeclineSource): Promise<ClientDeclineOutcome> {
  return handleClientDeclineWith(ctx, source, {
    markDeclined: clients.markDeclined,
    syncDocumentsStatus: syncMondayDocumentsStatus,
    removeFutureEmail,
    clearDraftingState: clients.clearDraftingState,
    channelState: (client, now) => getWaChannelState(client, now, DECLARATION_OF_CAPITAL),
    getSender: waSenders.getByInstanceId,
    sendText: sendWhatsAppTextAndRecord,
    listDocuments: clientDocuments.listForClient,
    sendDeclinedEmail,
    recordAudit,
    publishClientUpdated,
    now: () => new Date(),
  });
}
