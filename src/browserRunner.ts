/**
 * Browser-runner sidecar entrypoint. Runs the tax-authority browser automation
 * in a process that holds NO platform secrets (see src/browserRunner/env.ts) —
 * the worker drives it over HTTP with a bearer token. Keep every import here
 * inside src/browserRunner/ (+ the env-free logger): importing worker/web code
 * would drag src/config/env.ts in and defeat the isolation.
 */
import { runnerEnv } from './browserRunner/env.js';
import { closeAllSessions, createRunnerApp } from './browserRunner/server.js';
import { logger } from './util/logger.js';

const server = createRunnerApp().listen(runnerEnv.BROWSER_RUNNER_PORT, () => {
  logger.info('browser runner listening', { port: runnerEnv.BROWSER_RUNNER_PORT });
});

async function shutdown(): Promise<void> {
  logger.info('shutting down browser runner...');
  server.close();
  await closeAllSessions();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
