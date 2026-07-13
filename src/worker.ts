import { createSendEmailWorker } from './queue/sendEmailWorker.js';
import { resyncScheduledJobs } from './queue/resyncScheduledJobs.js';
import { createOverdueScanWorker, ensureOverdueScanScheduler } from './queue/overdueScanWorker.js';
import { runOverdueScan } from './agents/docCollector/overdueScan.js';
import { logger } from './util/logger.js';

await resyncScheduledJobs();
const worker = createSendEmailWorker();
logger.info('send_email worker started');

await ensureOverdueScanScheduler();
const overdueWorker = createOverdueScanWorker();
logger.info('overdue_scan worker started');
// Catch-up scan: covers the worker being down at the daily cron moment.
runOverdueScan().catch((err) => logger.error('boot overdue scan failed', err));

async function shutdown(): Promise<void> {
  logger.info('shutting down worker...');
  await Promise.all([worker.close(), overdueWorker.close()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
