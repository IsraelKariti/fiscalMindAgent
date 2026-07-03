import { createSendEmailWorker } from './queue/sendEmailWorker.js';
import { createWatchRenewalWorker, scheduleWatchRenewal } from './queue/watchRenewalWorker.js';
import { logger } from './util/logger.js';

const worker = createSendEmailWorker();
const watchWorker = createWatchRenewalWorker();
await scheduleWatchRenewal();
logger.info('send_email worker started');

async function shutdown(): Promise<void> {
  logger.info('shutting down worker...');
  await Promise.all([worker.close(), watchWorker.close()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
