import { env } from './config/env.js';
import { createApp } from './webhook/app.js';
import { logger } from './util/logger.js';

const app = createApp();
app.listen(env.PORT, () => {
  logger.info(`webhook server listening on port ${env.PORT}`);
});
