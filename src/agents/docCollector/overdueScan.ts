import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import { withClientLock } from '../../db/withClientLock.js';
import { pauseFutureEmail } from '../../orchestration/pauseFutureEmail.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { sendOverdueEmail } from './notifyAccountant.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';

/** Today as "YYYY-MM-DD" in the accountant's timezone (en-CA formats ISO-style). */
function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.ACCOUNTANT_TIMEZONE }).format(new Date());
}

/**
 * Stops the chase for doc-collector clients whose collection due date has
 * passed: pauses the client (stamping the overdue markers) and emails the
 * accountant the list of still-missing documents. Runs daily just after local
 * midnight plus once on worker boot; markOverdueStopped's conditional UPDATE
 * makes overlapping runs claim each client exactly once.
 */
export async function runOverdueScan(): Promise<void> {
  const candidates = await clients.listOverdueDocCollector(todayLocal());
  let stopped = 0;
  for (const candidate of candidates) {
    await withClientLock(candidate.id, async () => {
      const claimed = await clients.markOverdueStopped(candidate.id);
      if (!claimed) return; // another run got it, or the state changed since listing
      // Same order as the manual pause: flag first, then pull the pending job
      // (the preserved draft can be restored as-is on resume).
      await pauseFutureEmail(candidate.id);
      try {
        const documents = await clientDocuments.listForClient(candidate.id);
        const missing = documents.filter((d) => d.status === 'pending').map((d) => d.name);
        await sendOverdueEmail(claimed, missing);
      } catch (err) {
        // The stop stands either way — the UI shows the handed-off state.
        logger.error('overdue notification failed', err, { clientId: candidate.id });
      }
      publishClientUpdated(candidate.id);
      stopped += 1;
    });
  }
  logger.info('overdue scan finished', { candidates: candidates.length, stopped });
}
