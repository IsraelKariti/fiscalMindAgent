import { createSendEmailWorker } from './queue/sendEmailWorker.js';
import { resyncScheduledJobs } from './queue/resyncScheduledJobs.js';
import { logger } from './util/logger.js';

await resyncScheduledJobs();
const worker = createSendEmailWorker();
logger.info('send_email worker started');

async function shutdown(): Promise<void> {
  logger.info('shutting down worker...');
  await worker.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
