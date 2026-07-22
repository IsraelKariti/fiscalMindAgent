import { Queue } from 'bullmq';
import { redisConnection } from './connection.js';

export const TAX_FETCH_QUEUE_NAME = 'tax_fetch';

/** One step of a tax-authority fetch, executed in the worker (it owns the browser). */
export type TaxFetchJob =
  | { kind: 'start_login'; sessionId: string }
  | { kind: 'submit_otp'; sessionId: string; otp: string }
  | { kind: 'cancel'; sessionId: string };

export const taxFetchQueue = new Queue<TaxFetchJob>(TAX_FETCH_QUEUE_NAME, { connection: redisConnection });

export async function enqueueTaxFetch(job: TaxFetchJob): Promise<void> {
  await taxFetchQueue.add(job.kind, job, { removeOnComplete: true, removeOnFail: 100 });
}
