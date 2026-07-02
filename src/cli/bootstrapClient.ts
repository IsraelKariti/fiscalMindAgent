import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import * as clients from '../db/queries/clients.js';
import { scheduleDraftEmail } from '../orchestration/scheduleDraftEmail.js';
import { hoursToMs } from '../util/time.js';
import { logger } from '../util/logger.js';
import { pool } from '../db/pool.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { redisConnection } from '../queue/connection.js';

const HELP = `Usage: npm run cli:bootstrap -- --name "Jane Doe" --email jane@example.com \\
  --subject "Form 106 needed for your 2025 filing" \\
  --body-file ./drafts/jane-first-email.txt \\
  [--delay-minutes 1] [--force]

Creates a new client and enqueues the first "send_email" job (does not send immediately --
the same BullMQ worker that handles every follow-up also handles this first send).

Preconditions: migrations applied (npm run db:migrate), Gmail OAuth done (npm run gmail:auth),
Gmail watch() started (npm run gmail:watch), and the worker process running (npm run dev:worker)
so the enqueued job actually fires at its scheduled time.`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      email: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      'body-file': { type: 'string' },
      'delay-minutes': { type: 'string', default: '1' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const { name, email, subject } = values;
  if (!name || !email || !subject || (!values.body && !values['body-file'])) {
    console.error(HELP);
    process.exit(1);
  }

  const body = values.body ?? (await readFile(values['body-file']!, 'utf8'));
  const delayMinutes = Number(values['delay-minutes']);
  if (!Number.isFinite(delayMinutes) || delayMinutes < 0) {
    throw new Error(`invalid --delay-minutes: ${values['delay-minutes']}`);
  }

  const existing = await clients.getByEmailAddress(email!);
  if (existing && !values.force) {
    throw new Error(`client with email ${email} already exists (id ${existing.id}). Pass --force to reuse it.`);
  }
  const client = existing ?? (await clients.insert({ name: name!, emailAddress: email! }));

  const { emailId, jobId } = await scheduleDraftEmail(client.id, {
    subject: subject!,
    body,
    delayMs: hoursToMs(delayMinutes / 60),
  });

  logger.info('client bootstrapped', {
    clientId: client.id,
    emailId,
    jobId,
    scheduledInMinutes: delayMinutes,
  });
}

async function cleanup(): Promise<void> {
  await sendEmailQueue.close();
  redisConnection.disconnect();
  await pool.end();
}

main()
  .then(cleanup)
  .catch(async (err) => {
    logger.error('bootstrap failed', err);
    await cleanup();
    process.exit(1);
  });
