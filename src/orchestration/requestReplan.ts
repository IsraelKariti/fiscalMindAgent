import { replanQueue } from '../queue/replanQueue.js';
import { getMessageTiming } from './timingSettings.js';
import { turnStore } from './inboundTurn.js';
import { createAfterSendReplanRequester, createReplanRequester, replanDueAt, replanJobId } from './inboundTurnCore.js';

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
 * When the client's queued planner run is due (a turn's quiet window or an
 * after-send wait), or null when none is queued (openspec `turn-activity-states`).
 * The workspace client read serves it so the page tells a timer wait from a lost run.
 */
export async function queuedReplanUntil(clientId: string): Promise<Date | null> {
  return replanDueAt(await replanQueue.getJob(replanJobId(clientId)));
}
