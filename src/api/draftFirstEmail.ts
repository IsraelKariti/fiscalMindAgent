import { withClientLock } from '../db/withClientLock.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { logger } from '../util/logger.js';

// Retry delays for the fire-and-forget first-email draft. Without a scheduled email the
// agent never reaches out and the UI shows "drafting…" forever. Each attempt already
// retries transient Gemini errors internally with short backoff (see decide.ts), so this
// outer exponential schedule covers longer outages: ~1.5h of trying before giving up to the logs.
const FIRST_EMAIL_RETRY_DELAYS_MS = [30_000, 120_000, 480_000, 1_800_000, 3_600_000];

/** Fire-and-forget: has the agent draft and schedule the new client's first email. */
export function draftFirstEmail(clientId: string, attempt = 0): void {
  withClientLock(clientId, () => setFutureEmail(clientId)).catch((err) => {
    logger.error('first email drafting failed', err, { clientId, attempt });
    const delay = FIRST_EMAIL_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) setTimeout(() => draftFirstEmail(clientId, attempt + 1), delay);
  });
}
