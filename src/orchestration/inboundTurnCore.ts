/**
 * The Redis and queue mechanics of the inbound turn (openspec `inbound-turn`),
 * written over the small interfaces below so the tests run them against fakes.
 * The bound instances live in inboundTurn.ts and requestReplan.ts.
 */

/** The ioredis calls the turn store uses. */
export interface TurnRedis {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<unknown>;
}

// The {clientId} hash tag keeps a client's keys in one slot on sharded Redis.
const inflightKey = (clientId: string): string => `inbound:{${clientId}}:inflight`;
const lastKey = (clientId: string): string => `inbound:{${clientId}}:last`;
const dirtyKey = (clientId: string): string => `inbound:{${clientId}}:dirty`;

export interface TurnStore {
  /** First step of an inbound webhook handler: counts it as in flight and stamps the client's last inbound time. */
  markInboundStarted(clientId: string, now?: Date): Promise<void>;
  /** Last step of the handler (in a finally). */
  markInboundFinished(clientId: string): Promise<void>;
  read(clientId: string): Promise<{ inflight: number; lastInboundAt: Date | null }>;
  /** An inbound arrived while the planner was already running for the client. */
  setDirty(clientId: string): Promise<void>;
  clearDirty(clientId: string): Promise<void>;
  /** Reads and clears the flag. */
  takeDirty(clientId: string): Promise<boolean>;
}

/** `ttlSeconds` bounds every key: a handler that crashed before its finally cannot block the planner forever. */
export function createTurnStore(redis: TurnRedis, ttlSeconds: number): TurnStore {
  return {
    async markInboundStarted(clientId, now = new Date()) {
      await redis.incr(inflightKey(clientId));
      await redis.expire(inflightKey(clientId), ttlSeconds);
      await redis.set(lastKey(clientId), String(now.getTime()), 'EX', ttlSeconds);
    },
    async markInboundFinished(clientId) {
      // Below zero = the counter expired while this handler ran; drop the key
      // so the next handler starts from a clean count.
      if ((await redis.decr(inflightKey(clientId))) <= 0) await redis.del(inflightKey(clientId));
    },
    async read(clientId) {
      const [inflight, last] = await Promise.all([redis.get(inflightKey(clientId)), redis.get(lastKey(clientId))]);
      const lastMs = last === null ? NaN : Number(last);
      return {
        inflight: Math.max(0, Number(inflight ?? '0') || 0),
        lastInboundAt: Number.isFinite(lastMs) ? new Date(lastMs) : null,
      };
    },
    async setDirty(clientId) {
      await redis.set(dirtyKey(clientId), '1', 'EX', ttlSeconds);
    },
    async clearDirty(clientId) {
      await redis.del(dirtyKey(clientId));
    },
    async takeDirty(clientId) {
      const dirty = (await redis.get(dirtyKey(clientId))) !== null;
      if (dirty) await redis.del(dirtyKey(clientId));
      return dirty;
    },
  };
}

export interface ReplanJobData {
  clientId: string;
  /** Epoch ms of the first inbound of the turn — the maximum wait counts from here. */
  turnStartedAt: number;
}

/** The BullMQ calls the requester uses. */
export interface ReplanJobLike {
  data: ReplanJobData;
  getState(): Promise<string>;
  remove(): Promise<void>;
}
export interface ReplanQueueLike {
  getJob(jobId: string): Promise<ReplanJobLike | undefined>;
  add(name: string, data: ReplanJobData, opts: { jobId: string; delay: number }): Promise<unknown>;
}

// No ':' — BullMQ rejects custom ids with a colon (three-part ids like send_email's are its legacy exception).
export const replanJobId = (clientId: string): string => `replan-${clientId}`;

/** Never fire at once: leaves the last handler time to release its in-flight count. */
const MIN_DELAY_MS = 1_000;

/** States in which the job has not started yet, so it can be removed and re-added with a fresh delay. */
const NOT_STARTED = new Set(['delayed', 'waiting', 'prioritized', 'paused', 'waiting-children']);

/**
 * Builds `requestReplan`: asks for ONE deferred planner run for the client.
 * Every call moves the run to the end of the quiet window (the debounce) and
 * keeps the turn's original start. When the planner is already running, the call
 * only leaves the dirty flag — the worker re-plans once it is done.
 */
export function createReplanRequester(deps: {
  queue: ReplanQueueLike;
  store: Pick<TurnStore, 'setDirty' | 'read'>;
  quietMs: number;
  now?: () => number;
}): (clientId: string) => Promise<void> {
  const now = deps.now ?? (() => Date.now());
  // The quiet window counts from the client's last inbound webhook, not from
  // this call: a handler asks at its END, after its slow file work, and most
  // of the window has usually passed by then.
  const delayFor = async (clientId: string): Promise<number> => {
    const { lastInboundAt } = await deps.store.read(clientId);
    if (lastInboundAt === null) return deps.quietMs;
    return Math.min(deps.quietMs, Math.max(MIN_DELAY_MS, lastInboundAt.getTime() + deps.quietMs - now()));
  };
  return async (clientId) => {
    const jobId = replanJobId(clientId);
    let turnStartedAt = now();
    const existing = await deps.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'active') {
        await deps.store.setDirty(clientId);
        return;
      }
      if (NOT_STARTED.has(state)) turnStartedAt = existing.data.turnStartedAt;
      try {
        await existing.remove();
      } catch {
        // The worker picked the job up between getState and remove.
        await deps.store.setDirty(clientId);
        return;
      }
    }
    await deps.queue.add('replan', { clientId, turnStartedAt }, { jobId, delay: await delayFor(clientId) });
  };
}
