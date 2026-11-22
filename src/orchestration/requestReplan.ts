import { replanQueue } from '../queue/replanQueue.js';
import { getMessageTiming } from './timingSettings.js';
import { turnStore } from './inboundTurn.js';
import { afterSendDueAt, createAfterSendReplanRequester, createReplanRequester, replanJobId } from './inboundTurnCore.js';

/**
 * Asks for the client's deferred planner run (openspec `inbound-turn`). Called
 * once per inbound webhook; a burst of webhooks ends in one run, after the
 * quiet window and after all inbound processing (see replanWorker.ts).
 */
export const requestReplan = createReplanRequester({
  queue: replanQueue,
  store: turnStore,
  quietMs: async () => (await getMessageTiming()).quietSeconds * 1000,
});

/**
 * Asks for the planner run that follows the agent's own delivered message
 * (openspec `after-send-plan-delay`), after the configured after-send delay —
 * or after `delayMs` when the caller passes one (boot recovery of a lost wait).
 */
export const requestReplanAfterSend = createAfterSendReplanRequester({
  queue: replanQueue,
  store: turnStore,
  delayMs: async () => (await getMessageTiming()).afterSendDelaySeconds * 1000,
});

/**
 * When the client's queued after-send wait is due, or null when no such wait
 * is queued (openspec `after-send-wait-state`). The workspace client read
 * serves it so the page stays silent instead of showing a drafting state.
 */
export async function afterSendWaitUntil(clientId: string): Promise<Date | null> {
  return afterSendDueAt(await replanQueue.getJob(replanJobId(clientId)));
}
