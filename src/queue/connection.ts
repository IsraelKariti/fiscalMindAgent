import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Shared BullMQ options. The hash-tagged prefix keeps every queue key in one
 * cluster slot — required on sharded Redis (Azure Managed Redis), harmless on
 * standalone; BullMQ's multi-key Lua scripts fail with CROSSSLOT otherwise.
 */
export const bullOpts = { connection: redisConnection, prefix: '{bull}' } as const;
