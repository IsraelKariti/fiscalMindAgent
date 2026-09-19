import { Queue } from 'bullmq';
import { bullOpts } from './connection.js';
import type { ReplanJobData } from '../orchestration/inboundTurnCore.js';

export const REPLAN_QUEUE_NAME = 'replan';

/** One delayed job per client (`replan-<clientId>`): the deferred planner run of the client's current turn. */
export const replanQueue = new Queue<ReplanJobData>(REPLAN_QUEUE_NAME, {
  ...bullOpts,
  // Finished jobs must vanish, or the next turn's add under the same id is a no-op.
  defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
});
