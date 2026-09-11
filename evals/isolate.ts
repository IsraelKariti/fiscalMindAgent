import { redisConnection } from '../src/queue/connection.js';

/**
 * The harness imports the platform's build*Call factories, and one of them
 * (declarationOfCapital/formIntake.ts) transitively imports
 * events/clientEvents.ts -> queue/connection.ts, which constructs an ioredis
 * client at import time and starts connecting to REDIS_URL. The harness never
 * uses it: this closes it right away so a run neither needs Redis nor keeps
 * the process alive / spams "ECONNREFUSED" when Redis is down.
 *
 * (Postgres is fine: pg's Pool opens no connection until the first query, and
 * no harness path queries — runLlmCall always gets an explicit `model`.)
 */
export function quietRedis(): void {
  redisConnection.on('error', () => {});
  redisConnection.disconnect();
}
