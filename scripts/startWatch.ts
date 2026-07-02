import { startWatch } from '../src/gmail/watch.js';
import { logger } from '../src/util/logger.js';

startWatch()
  .then(({ mailbox, historyId, expiration }) => {
    logger.info('Gmail watch() started', { mailbox, historyId, expiration });
    process.exit(0);
  })
  .catch((err) => {
    logger.error('failed to start Gmail watch()', err);
    process.exit(1);
  });
