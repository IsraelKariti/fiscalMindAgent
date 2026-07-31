import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { logger } from '../src/util/logger.js';
import * as users from '../src/db/queries/users.js';
import * as whitelist from '../src/db/queries/whitelist.js';
import * as agentInstances from '../src/db/queries/agentInstances.js';
import * as clients from '../src/db/queries/clients.js';

/**
 * Seeds the sandbox stack with synthetic demo data: one whitelisted demo
 * accountant, an instance of each implemented agent type, and a few fake
 * clients. Idempotent — safe to re-run after a DB reset or new migration.
 *
 * Prod data is NEVER copied into the sandbox (client PII, tax credentials);
 * this script is the sanctioned way to populate it. All contact details are
 * undeliverable by construction (.invalid domain, +1500555 test numbers) and
 * the sandbox's OUTBOUND_ALLOWLIST fences real sends anyway.
 */

const DEMO_SUB = 'sandbox-demo-accountant';
const DEMO_EMAIL = 'demo.accountant@sandbox.invalid';

const AGENT_TYPES = ['doc_collector', 'annual_report_assistant', 'debt_collector', 'customer_service'];

const DEMO_CLIENTS: { agentType: string; name: string; email: string; phone: string }[] = [
  { agentType: 'doc_collector', name: 'ישראל ישראלי', email: 'client-doc-1@sandbox.invalid', phone: '+15005550001' },
  { agentType: 'doc_collector', name: 'שרה כהן', email: 'client-doc-2@sandbox.invalid', phone: '+15005550002' },
  { agentType: 'doc_collector', name: 'דוד לוי', email: 'client-doc-3@sandbox.invalid', phone: '+15005550003' },
  { agentType: 'debt_collector', name: 'רחל אברהם', email: 'client-debt-1@sandbox.invalid', phone: '+15005550004' },
  { agentType: 'debt_collector', name: 'משה פרץ', email: 'client-debt-2@sandbox.invalid', phone: '+15005550005' },
];

async function main(): Promise<void> {
  // Latch: seeding writes junk accounts, so it refuses to touch anything but a
  // stack that declares itself the sandbox. --force covers local experiments.
  if (env.ENV_NAME !== 'sandbox' && !process.argv.includes('--force')) {
    logger.error('refusing to seed: ENV_NAME is not "sandbox" (pass --force to override on a local DB)');
    process.exit(1);
  }

  const accountant = await users.upsertFromGoogle({
    googleSub: DEMO_SUB,
    email: DEMO_EMAIL,
    name: 'רו״ח דמו (סנדבוקס)',
    pictureUrl: null,
  });
  await whitelist.add(DEMO_EMAIL, 'Sandbox demo accountant', 'רו״ח דמו (סנדבוקס)');
  logger.info('demo accountant ready', { userId: accountant.id, email: DEMO_EMAIL });

  const instanceByType = new Map<string, string>();
  for (const agentType of AGENT_TYPES) {
    const instance = await agentInstances.enableInstance(accountant.id, agentType);
    instanceByType.set(agentType, instance.id);
  }
  logger.info('agent instances enabled', { types: AGENT_TYPES });

  let created = 0;
  for (const demo of DEMO_CLIENTS) {
    const existing = await clients.getByEmailAddressForUser(accountant.id, demo.email);
    if (existing) continue;
    await clients.insert({
      userId: accountant.id,
      agentInstanceId: instanceByType.get(demo.agentType),
      name: demo.name,
      emailAddress: demo.email,
      phone: demo.phone,
    });
    created += 1;
  }
  logger.info('synthetic clients ready', { created, existing: DEMO_CLIENTS.length - created });

  await pool.end();
  logger.info('sandbox seed complete');
}

main().catch((err) => {
  logger.error('sandbox seed failed', err);
  process.exit(1);
});
