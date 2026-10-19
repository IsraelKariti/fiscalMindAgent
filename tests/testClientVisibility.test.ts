/**
 * Admin test clients (openspec `admin-test-client`) against a real database —
 * the visibility rule lives in the SQL of the roster queries (migration 067's
 * is_test column), so a pure test cannot cover it. Runs only through
 * `npm run test:db` (or with DB_TESTS=1), against the local stack's
 * DATABASE_URL (migration 067 applied); it creates a throwaway accountant and
 * deletes it (and everything under it, by cascade) at the end.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const enabled = process.env['DB_TESTS'] === '1' || process.env['npm_lifecycle_event'] === 'test:db';

describe('admin test client visibility (DB)', { skip: enabled ? false : 'run with `npm run test:db` against the local database' }, () => {
  let pool: typeof import('../src/db/pool.js')['pool'];
  let clients: typeof import('../src/db/queries/clients.js');
  let dashboard: typeof import('../src/db/queries/dashboard.js');
  let agentInstances: typeof import('../src/db/queries/agentInstances.js');
  let userId = '';
  let instanceId = '';
  const stamp = Date.now();
  const phone = `+97250${String(stamp).slice(-7)}`;

  before(async () => {
    ({ pool } = await import('../src/db/pool.js'));
    clients = await import('../src/db/queries/clients.js');
    dashboard = await import('../src/db/queries/dashboard.js');
    agentInstances = await import('../src/db/queries/agentInstances.js');
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, name) VALUES ($1, 'test-client test') RETURNING id`,
      [`owner-test-${stamp}@test.invalid`],
    );
    userId = rows[0]!.id;
    instanceId = (await agentInstances.enableInstance(userId, 'declaration_of_capital')).id;
  });

  after(async () => {
    if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  test('a test client is absent from every accountant-facing query and present for the admin scope', async () => {
    const real = await clients.insert({
      userId,
      agentInstanceId: instanceId,
      name: 'Real',
      emailAddress: `real-${stamp}@test.invalid`,
      phone: null,
    });
    const testClient = await clients.insert({
      userId,
      agentInstanceId: instanceId,
      name: 'Test',
      emailAddress: `test-${stamp}@test.invalid`,
      phone,
      paused: true,
      isTest: true,
      agentFields: { due_date: '2000-01-01' },
    });
    assert.equal(real.is_test, false);
    assert.equal(testClient.is_test, true);

    // The accountant's rosters.
    assert.deepEqual((await clients.listForInstance(instanceId)).map((c) => c.id), [real.id]);
    assert.ok(!(await dashboard.listClientSummariesForInstance(instanceId)).some((c) => c.id === testClient.id));
    assert.equal(await dashboard.countFilesForInstance(instanceId), 0);
    assert.ok(!(await clients.listOverdueForAgentTypes('2999-12-31', ['declaration_of_capital'])).some((c) => c.id === testClient.id));
    const counted = (await agentInstances.listAllWithClientCounts()).find((i) => i.id === instanceId);
    assert.equal(counted?.client_count, 1);

    // By id: only the admin's view-as scope reaches it.
    assert.equal(await clients.getByIdForInstance(testClient.id, instanceId), null);
    assert.equal((await clients.getByIdForInstance(testClient.id, instanceId, { includeTest: true }))?.id, testClient.id);
    assert.equal((await clients.getByIdForInstance(real.id, instanceId))?.id, real.id);

    // The admin's list holds both; work paths and inbound routing find the test client.
    assert.deepEqual(
      (await clients.listForInstance(instanceId, { includeTest: true })).map((c) => c.id).sort(),
      [real.id, testClient.id].sort(),
    );
    assert.equal((await clients.getById(testClient.id))?.id, testClient.id);
    assert.equal((await clients.getByWaPhoneForInstance(instanceId, phone))?.id, testClient.id);

    // Deleting a test client keeps the flag on the deleted row.
    assert.equal(await clients.markDeleted(testClient.id, instanceId, userId), true);
    const deleted = await clients.listDeletedForInstance(instanceId);
    assert.equal(deleted[0]?.id, testClient.id);
    assert.equal(deleted[0]?.is_test, true);
  });
});
