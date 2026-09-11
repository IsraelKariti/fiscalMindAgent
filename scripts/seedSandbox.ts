import { env } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';
import { logger } from '../src/util/logger.js';
import { syntheticWaEmail } from '../src/util/syntheticEmail.js';
import * as users from '../src/db/queries/users.js';
import * as whitelist from '../src/db/queries/whitelist.js';
import * as agentInstances from '../src/db/queries/agentInstances.js';
import * as clients from '../src/db/queries/clients.js';
import { DECLARATION_OF_CAPITAL } from '../src/agents/declarationOfCapital/agentType.js';

/**
 * Seeds the sandbox stack with synthetic demo data: one whitelisted demo
 * accountant, a declaration-of-capital instance, and a few fake phone-keyed
 * clients (paused, like kickoff-enrolled ones). Idempotent — safe to re-run
 * after a DB reset or new migration.
 *
 * Prod data is NEVER copied into the sandbox (client PII, tax credentials);
 * this script is the sanctioned way to populate it. All contact details are
 * undeliverable by construction (.invalid domain, +1500555 test numbers) and
 * the sandbox's OUTBOUND_ALLOWLIST fences real sends anyway.
 */

const DEMO_SUB = 'sandbox-demo-accountant';
const DEMO_EMAIL = 'demo.accountant@sandbox.invalid';

const DEMO_CLIENTS: { name: string; phone: string }[] = [
  { name: 'ישראל ישראלי', phone: '+15005550001' },
  { name: 'שרה כהן', phone: '+15005550002' },
  { name: 'דוד לוי', phone: '+15005550003' },
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

  const instance = await agentInstances.enableInstance(accountant.id, DECLARATION_OF_CAPITAL);
  logger.info('agent instance enabled', { type: DECLARATION_OF_CAPITAL, instanceId: instance.id });

  let created = 0;
  for (const demo of DEMO_CLIENTS) {
    const existing = await clients.getByWaPhoneForInstance(instance.id, demo.phone);
    if (existing) continue;
    await clients.insert({
      userId: accountant.id,
      agentInstanceId: instance.id,
      name: demo.name,
      emailAddress: syntheticWaEmail(demo.phone),
      phone: demo.phone,
      paused: true,
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
