import { redisConnection } from '../queue/connection.js';
import { createTurnStore } from './inboundTurnCore.js';

/**
 * How long a client's turn keys live in Redis. Only a key lifetime, not the
 * maximum wait (that is the admin-set timing, openspec `admin-timing-settings`):
 * a day keeps the keys alive for any max wait an admin would set.
 */
const TURN_KEY_TTL_SECONDS = 24 * 3600;

/** The per-client turn state in Redis, shared by the web process (webhooks) and the worker (the deferred re-plan). */
export const turnStore = createTurnStore(redisConnection, TURN_KEY_TTL_SECONDS);

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
