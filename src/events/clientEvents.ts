import { redisConnection } from '../queue/connection.js';
import { logger } from '../util/logger.js';

/**
 * Cross-process "this client's conversation state changed" signal, carried over Redis pub/sub
 * so the worker's transitions reach the web process too. Published on every transition the
 * timeline renders — reply stored, pending send canceled, new draft scheduled, goal completed —
 * and forwarded to the browser over SSE so the UI updates the moment the state changes instead
 * of waiting for its fallback poll.
 */
const CLIENT_UPDATED_CHANNEL = 'client_updated';

/** Fire-and-forget: a lost signal only delays the UI until its next fallback poll. */
export function publishClientUpdated(clientId: string): void {
  redisConnection
    .publish(CLIENT_UPDATED_CHANNEL, clientId)
    .catch((err) => logger.error('publish client_updated failed', err, { clientId }));
}

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

// One subscriber connection for the whole process, created on the first SSE client so the
// worker and CLI (which only publish) never open it. ioredis requires a dedicated connection
// once it enters subscriber mode, hence the duplicate().
let subscriber: ReturnType<typeof redisConnection.duplicate> | null = null;

function ensureSubscriber(): void {
  if (subscriber) return;
  subscriber = redisConnection.duplicate();
  subscriber.subscribe(CLIENT_UPDATED_CHANNEL).catch((err) => logger.error('subscribe client_updated failed', err));
  subscriber.on('message', (_channel: string, clientId: string) => {
    for (const listener of listeners.get(clientId) ?? []) listener();
  });
}

/** Registers a listener for one client's update signals; returns its unsubscribe function. */
export function onClientUpdated(clientId: string, listener: Listener): () => void {
  ensureSubscriber();
  let set = listeners.get(clientId);
  if (!set) {
    set = new Set();
    listeners.set(clientId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(clientId);
  };
}
