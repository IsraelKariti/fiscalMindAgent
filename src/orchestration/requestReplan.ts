import { replanQueue } from '../queue/replanQueue.js';
import { env } from '../config/env.js';
import { turnStore } from './inboundTurn.js';
import { createReplanRequester } from './inboundTurnCore.js';

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
