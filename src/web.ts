import { env } from './config/env.js';
import * as users from './db/queries/users.js';
import { createApp } from './webhook/app.js';
import { logger } from './util/logger.js';

const app = createApp();
app.listen(env.PORT, () => {
  logger.info(`webhook server listening on port ${env.PORT}`);
});

// One-time admin bootstrap (no-op once any admin exists): promotes existing
// ADMIN_EMAILS accounts so a fresh deploy of migration 033 keeps its admins.
users
  .bootstrapAdminsIfNone(env.ADMIN_EMAILS)
  .then((granted) => {
    if (granted.length > 0) logger.info('bootstrapped admins from ADMIN_EMAILS', { emails: granted });
  })
  .catch((err) => logger.error('admin bootstrap failed', err));
