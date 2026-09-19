import { redisConnection } from '../queue/connection.js';
import { env } from '../config/env.js';
import { createTurnStore } from './inboundTurnCore.js';

/** The per-client turn state in Redis, shared by the web process (webhooks) and the worker (the deferred re-plan). */
export const turnStore = createTurnStore(redisConnection, env.INBOUND_MAX_WAIT_SECONDS);

/**
 * Runs an inbound webhook handler's work counted as in flight for the client,
 * so the planner waits for it (openspec `inbound-turn`). Covers everything
 * from the download to the last file's classification.
 */
export async function withInboundInFlight<T>(clientId: string, fn: () => Promise<T>): Promise<T> {
  await turnStore.markInboundStarted(clientId);
  try {
    return await fn();
  } finally {
    await turnStore.markInboundFinished(clientId);
  }
}
