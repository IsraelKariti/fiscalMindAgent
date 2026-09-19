import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideReplan, isTurnSettled } from '../src/orchestration/inboundTurnRules.js';
import {
  createReplanRequester,
  createTurnStore,
  replanJobId,
  type ReplanJobData,
  type ReplanJobLike,
  type ReplanQueueLike,
  type TurnRedis,
} from '../src/orchestration/inboundTurnCore.js';

const now = new Date('2026-09-19T10:00:00Z');
const secondsAgo = (s: number): Date => new Date(now.getTime() - s * 1000);
const QUIET_MS = 15_000;
const limits = { quietMs: QUIET_MS, maxWaitMs: 300_000 };

describe('isTurnSettled', () => {
  it('is not settled while a webhook handler is in flight', () => {
    assert.equal(isTurnSettled({ inflight: 1, lastInboundAt: secondsAgo(60), pendingFiles: 0 }, now, QUIET_MS), false);
  });

  it('is not settled inside the quiet window', () => {
    assert.equal(isTurnSettled({ inflight: 0, lastInboundAt: secondsAgo(5), pendingFiles: 0 }, now, QUIET_MS), false);
  });

  it('is not settled while a file waits for analysis', () => {
    assert.equal(isTurnSettled({ inflight: 0, lastInboundAt: secondsAgo(60), pendingFiles: 2 }, now, QUIET_MS), false);
  });

  it('is settled when nothing runs and the client has been quiet for the window', () => {
    assert.equal(isTurnSettled({ inflight: 0, lastInboundAt: secondsAgo(15), pendingFiles: 0 }, now, QUIET_MS), true);
  });

  it('is settled when the last inbound time is unknown (keys expired)', () => {
    assert.equal(isTurnSettled({ inflight: 0, lastInboundAt: null, pendingFiles: 0 }, now, QUIET_MS), true);
  });
});

describe('decideReplan', () => {
  const busy = { inflight: 1, lastInboundAt: secondsAgo(2), pendingFiles: 1 };

  it('plans a settled turn', () => {
    assert.equal(decideReplan({ inflight: 0, lastInboundAt: secondsAgo(20), pendingFiles: 0 }, secondsAgo(20), now, limits), 'plan');
  });

  it('waits while the turn is not settled', () => {
    assert.equal(decideReplan(busy, secondsAgo(40), now, limits), 'wait');
  });

  it('forces the plan once the turn has waited the maximum', () => {
    assert.equal(decideReplan(busy, secondsAgo(300), now, limits), 'force');
  });
});

/** The few Redis commands the store uses, over a Map. */
function fakeRedis(): TurnRedis & { data: Map<string, string>; ttl: Map<string, number> } {
  const data = new Map<string, string>();
  const ttl = new Map<string, number>();
  const bump = (key: string, by: number): number => {
    const next = Number(data.get(key) ?? '0') + by;
    data.set(key, String(next));
    return next;
  };
  return {
    data,
    ttl,
    incr: async (key) => bump(key, 1),
    decr: async (key) => bump(key, -1),
    expire: async (key, seconds) => void ttl.set(key, seconds),
    set: async (key, value, _mode, seconds) => {
      data.set(key, value);
      ttl.set(key, seconds);
    },
    get: async (key) => data.get(key) ?? null,
    del: async (...keys) => keys.forEach((k) => data.delete(k)),
  };
}

describe('turn store', () => {
  it('counts concurrent handlers and returns to zero', async () => {
    const redis = fakeRedis();
    const store = createTurnStore(redis, 300);
    await store.markInboundStarted('c1', secondsAgo(3));
    await store.markInboundStarted('c1', now);
    assert.deepEqual(await store.read('c1'), { inflight: 2, lastInboundAt: now });
    await store.markInboundFinished('c1');
    await store.markInboundFinished('c1');
    assert.equal((await store.read('c1')).inflight, 0);
    assert.equal(redis.data.has('inbound:{c1}:inflight'), false);
  });

  it('puts a TTL on the counter so a crashed handler cannot block forever', async () => {
    const redis = fakeRedis();
    await createTurnStore(redis, 300).markInboundStarted('c1', now);
    assert.equal(redis.ttl.get('inbound:{c1}:inflight'), 300);
  });

  it('never reads a negative count after the counter expired mid-handler', async () => {
    const redis = fakeRedis();
    const store = createTurnStore(redis, 300);
    await store.markInboundFinished('c1');
    assert.equal((await store.read('c1')).inflight, 0);
    await store.markInboundStarted('c1', now);
    assert.equal((await store.read('c1')).inflight, 1);
  });

  it('reads an unknown client as idle', async () => {
    assert.deepEqual(await createTurnStore(fakeRedis(), 300).read('nobody'), { inflight: 0, lastInboundAt: null });
  });

  it('takes the dirty flag once', async () => {
    const store = createTurnStore(fakeRedis(), 300);
    await store.setDirty('c1');
    assert.equal(await store.takeDirty('c1'), true);
    assert.equal(await store.takeDirty('c1'), false);
  });
});

/** A queue that holds at most one job per id, like BullMQ with custom job ids. */
function fakeQueue(): ReplanQueueLike & { jobs: Map<string, { data: ReplanJobData; delay: number; state: string; addedAt: number }>; clock: { t: number } } {
  const jobs = new Map<string, { data: ReplanJobData; delay: number; state: string; addedAt: number }>();
  const clock = { t: 1_000_000 };
  return {
    jobs,
    clock,
    async getJob(jobId) {
      const job = jobs.get(jobId);
      if (!job) return undefined;
      const like: ReplanJobLike = {
        data: job.data,
        getState: async () => job.state,
        remove: async () => void jobs.delete(jobId),
      };
      return like;
    },
    async add(_name, data, opts) {
      if (!jobs.has(opts.jobId)) jobs.set(opts.jobId, { data, delay: opts.delay, state: 'delayed', addedAt: clock.t });
    },
  };
}

describe('requestReplan', () => {
  it('two requests leave one job, fired after the later one, with the turn start of the first', async () => {
    const queue = fakeQueue();
    const dirty: string[] = [];
    const request = createReplanRequester({
      queue,
      store: { setDirty: async (id) => void dirty.push(id), read: async () => ({ inflight: 0, lastInboundAt: new Date(queue.clock.t) }) },
      quietMs: QUIET_MS,
      now: () => queue.clock.t,
    });
    await request('c1');
    const firstStart = queue.clock.t;
    queue.clock.t += 8_000;
    await request('c1');

    assert.equal(queue.jobs.size, 1);
    const job = queue.jobs.get(replanJobId('c1'))!;
    assert.equal(job.addedAt + job.delay, firstStart + 8_000 + QUIET_MS);
    assert.equal(job.data.turnStartedAt, firstStart);
    assert.deepEqual(dirty, []);
  });

  it('only leaves the dirty flag while the planner is running', async () => {
    const queue = fakeQueue();
    const dirty: string[] = [];
    const request = createReplanRequester({
      queue,
      store: { setDirty: async (id) => void dirty.push(id), read: async () => ({ inflight: 0, lastInboundAt: null }) },
      quietMs: QUIET_MS,
    });
    await request('c1');
    const running = queue.jobs.get(replanJobId('c1'))!;
    running.state = 'active';
    await request('c1');

    assert.deepEqual(dirty, ['c1']);
    assert.equal(queue.jobs.get(replanJobId('c1')), running);
  });

  it('counts the quiet window from the last inbound webhook, not from the request', async () => {
    const queue = fakeQueue();
    const lastInboundAt = new Date(queue.clock.t - 12_000); // the handler worked 12s on its file
    const request = createReplanRequester({
      queue,
      store: { setDirty: async () => {}, read: async () => ({ inflight: 1, lastInboundAt }) },
      quietMs: QUIET_MS,
      now: () => queue.clock.t,
    });
    await request('c1');
    assert.equal(queue.jobs.get(replanJobId('c1'))!.delay, 3_000);
  });

  it('never fires at once, even when the window has already passed', async () => {
    const queue = fakeQueue();
    const request = createReplanRequester({
      queue,
      store: { setDirty: async () => {}, read: async () => ({ inflight: 1, lastInboundAt: new Date(queue.clock.t - 60_000) }) },
      quietMs: QUIET_MS,
      now: () => queue.clock.t,
    });
    await request('c1');
    assert.equal(queue.jobs.get(replanJobId('c1'))!.delay, 1_000);
  });

  it('uses a job id without a colon', () => {
    assert.equal(replanJobId('abc').includes(':'), false);
  });
});
