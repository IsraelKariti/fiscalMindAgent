import http from 'node:http';
import { createSendEmailWorker } from './queue/sendEmailWorker.js';
import { resyncScheduledJobs } from './queue/resyncScheduledJobs.js';
import { createOverdueScanWorker, ensureOverdueScanScheduler } from './queue/overdueScanWorker.js';
import { createDebtScanWorker, ensureDebtScanScheduler } from './queue/debtScanWorker.js';
import { createClientImportScanWorker, ensureClientImportScanScheduler } from './queue/clientImportScanWorker.js';
import { createTaxFetchWorker, sweepOrphanedTaxFetchSessions } from './queue/taxFetchWorker.js';
import { createAnomalyScanWorker, ensureAnomalyScanScheduler } from './queue/anomalyScanWorker.js';
import { env } from './config/env.js';
import { runOverdueScan } from './agents/docCollector/overdueScan.js';
import { runDebtScan } from './agents/debtCollector/dailyScan.js';
import { runClientImportScan } from './agents/shared/clientImportScan.js';
import { logger } from './util/logger.js';

// App Service (unlike Container Apps) probes the container's port and restarts
// containers that never listen; the worker has no HTTP role, so expose a bare
// health endpoint only where the platform demands one.
if (env.WORKER_HEALTH_PORT) {
  http
    .createServer((req, res) => {
      if (req.url === '/healthz' || req.url === '/') {
        // The sha lets the deploy workflow wait for THIS build to answer —
        // during a container swap the old build keeps serving 200s.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, sha: process.env.GIT_SHA ?? 'dev' }));
        return;
      }
      res.writeHead(404);
      res.end();
    })
    .listen(env.WORKER_HEALTH_PORT, () => logger.info('worker health listener up', { port: env.WORKER_HEALTH_PORT }));
}

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

await ensureAnomalyScanScheduler();
const anomalyScanWorker = createAnomalyScanWorker();
logger.info('anomaly_scan worker started');

const taxFetchWorker = createTaxFetchWorker();
logger.info('tax_fetch worker started');
// Any live-browser session in the DB was orphaned by the last restart (pages are in-memory).
sweepOrphanedTaxFetchSessions().catch((err) => logger.error('boot tax-fetch sweep failed', err));

async function shutdown(): Promise<void> {
  logger.info('shutting down worker...');
  await Promise.all([
    worker.close(),
    overdueWorker.close(),
    debtScanWorker.close(),
    clientImportScanWorker.close(),
    anomalyScanWorker.close(),
    taxFetchWorker.close(),
  ]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
