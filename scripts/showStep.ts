import { pool } from '../src/db/pool.js';
import * as auditEvents from '../src/db/queries/auditEvents.js';

/**
 * Prints one audited code step as JSON, from a step link copied in the step
 * detail modal (`<site>/#/steps/<id>`) or from a bare id. Reads the database
 * DATABASE_URL points at — the local one. A link from another host (sandbox,
 * production) names a row this database does not hold: ask for the modal's
 * "copy details" text instead.
 *
 *   npm run step -- "<link-or-id>"
 *
 * Exit code: 0 = printed, 1 = no uuid in the argument, or no such step.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

async function main(): Promise<number> {
  const arg = process.argv[2] ?? '';
  // The step id is the last uuid of the link (the hash segment).
  const id = arg.match(UUID)?.pop();
  if (!id) {
    console.error('Usage: npm run step -- "<step link or id>" (no step id found in the argument)');
    return 1;
  }
  const row = await auditEvents.getById(id);
  if (!row) {
    console.error(`Step ${id} is not in this database. If the link is from another environment, paste the modal's "copy details" text instead.`);
    return 1;
  }
  console.log(
    JSON.stringify(
      {
        id: row.id,
        occurredAt: row.occurred_at,
        action: row.action,
        actorType: row.actor_type,
        severity: row.severity,
        targetType: row.target_type,
        targetId: row.target_id,
        suspectedInjection: row.suspected_injection,
        clientId: row.client_id,
        clientName: row.client_name,
        agentInstanceId: row.agent_instance_id,
        detail: row.detail,
      },
      null,
      2,
    ),
  );
  return 0;
}

main()
  .catch((err) => {
    console.error(err);
    return 1;
  })
  .then(async (code) => {
    await pool.end();
    process.exit(code);
  });
