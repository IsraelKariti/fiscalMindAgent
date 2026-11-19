import { replanQueue } from '../queue/replanQueue.js';
import { env } from '../config/env.js';
import { turnStore } from './inboundTurn.js';
import { createAfterSendReplanRequester, createReplanRequester } from './inboundTurnCore.js';

/**
 * Asks for the client's deferred planner run (openspec `inbound-turn`). Called
 * once per inbound webhook; a burst of webhooks ends in one run, after the
 * quiet window and after all inbound processing (see replanWorker.ts).
 */
export const requestReplan = createReplanRequester({
  queue: replanQueue,
  store: turnStore,
  quietMs: env.INBOUND_QUIET_SECONDS * 1000,
});

/**
 * Asks for the planner run that follows the agent's own delivered message
 * (openspec `after-send-plan-delay`), after the configured after-send delay —
 * or after `delayMs` when the caller passes one (boot recovery of a lost wait).
 */
export const requestReplanAfterSend = createAfterSendReplanRequester({
  queue: replanQueue,
  store: turnStore,
  delayMs: env.AFTER_SEND_PLAN_DELAY_SECONDS * 1000,
});
