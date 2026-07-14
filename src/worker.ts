import { createSendEmailWorker } from './queue/sendEmailWorker.js';
import { resyncScheduledJobs } from './queue/resyncScheduledJobs.js';
import { createOverdueScanWorker, ensureOverdueScanScheduler } from './queue/overdueScanWorker.js';
import { createDebtScanWorker, ensureDebtScanScheduler } from './queue/debtScanWorker.js';
import { createClientImportScanWorker, ensureClientImportScanScheduler } from './queue/clientImportScanWorker.js';
import { runOverdueScan } from './agents/docCollector/overdueScan.js';
import { runDebtScan } from './agents/debtCollector/dailyScan.js';
import { runClientImportScan } from './agents/shared/clientImportScan.js';
import { logger } from './util/logger.js';

await resyncScheduledJobs();
const worker = createSendEmailWorker();
logger.info('send_email worker started');

await ensureOverdueScanScheduler();
const overdueWorker = createOverdueScanWorker();
logger.info('overdue_scan worker started');
// Catch-up scan: covers the worker being down at the daily cron moment.
runOverdueScan().catch((err) => logger.error('boot overdue scan failed', err));

await ensureDebtScanScheduler();
const debtScanWorker = createDebtScanWorker();
logger.info('debt_scan worker started');
// Catch-up sweep, same rationale; already-enrolled clients make re-runs no-ops.
runDebtScan().catch((err) => logger.error('boot debt scan failed', err));

await ensureClientImportScanScheduler();
const clientImportScanWorker = createClientImportScanWorker();
logger.info('client_import_scan worker started');
// Catch-up sweep, same rationale; already-enrolled clients make re-runs no-ops.
runClientImportScan().catch((err) => logger.error('boot client import scan failed', err));

async function shutdown(): Promise<void> {
  logger.info('shutting down worker...');
  await Promise.all([worker.close(), overdueWorker.close(), debtScanWorker.close(), clientImportScanWorker.close()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
