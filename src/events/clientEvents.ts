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

/**
 * Cross-process "this instance's client roster changed" signal: a client was enrolled or
 * deleted (import scans, daily auto-enrolls, manual add/delete). Forwarded to the browser
 * over SSE so the workspace sidebar refills the moment enrollment happens — including
 * enrollments made by the worker process or another tab.
 */
const INSTANCE_CLIENTS_CHANNEL = 'instance_clients_updated';

/** Fire-and-forget: a lost signal only delays the UI until its next fallback poll. */
export function publishClientUpdated(clientId: string): void {
  publish(CLIENT_UPDATED_CHANNEL, clientId);
}

/** Fire-and-forget, like publishClientUpdated. */
export function publishInstanceClientsUpdated(agentInstanceId: string): void {
  publish(INSTANCE_CLIENTS_CHANNEL, agentInstanceId);
}

function publish(channel: string, key: string): void {
  redisConnection.publish(channel, key).catch((err) => logger.error(`publish ${channel} failed`, err, { key }));
}

type Listener = () => void;
/** channel → key (client id / instance id) → listeners */
const listeners: Record<string, Map<string, Set<Listener>>> = {
  [CLIENT_UPDATED_CHANNEL]: new Map(),
  [INSTANCE_CLIENTS_CHANNEL]: new Map(),
};

// One subscriber connection for the whole process, created on the first SSE client so the
// worker and CLI (which only publish) never open it. ioredis requires a dedicated connection
// once it enters subscriber mode, hence the duplicate().
let subscriber: ReturnType<typeof redisConnection.duplicate> | null = null;

function ensureSubscriber(): void {
  if (subscriber) return;
  subscriber = redisConnection.duplicate();
  subscriber
    .subscribe(...Object.keys(listeners))
    .catch((err) => logger.error('subscribe client event channels failed', err));
  subscriber.on('message', (channel: string, key: string) => {
    for (const listener of listeners[channel]?.get(key) ?? []) listener();
  });
}

function addListener(channel: string, key: string, listener: Listener): () => void {
  ensureSubscriber();
  const byKey = listeners[channel]!;
  let set = byKey.get(key);
  if (!set) {
    set = new Set();
    byKey.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) byKey.delete(key);
  };
}

/** Registers a listener for one client's update signals; returns its unsubscribe function. */
export function onClientUpdated(clientId: string, listener: Listener): () => void {
  return addListener(CLIENT_UPDATED_CHANNEL, clientId, listener);
}

/** Registers a listener for one instance's roster-change signals; returns its unsubscribe function. */
export function onInstanceClientsUpdated(agentInstanceId: string, listener: Listener): () => void {
  return addListener(INSTANCE_CLIENTS_CHANNEL, agentInstanceId, listener);
}
