/**
 * Client identity and soft delete (openspec `soft-delete-clients`) against a
 * real database — the rule lives in the partial unique indexes of migration
 * 063 and in the LIVE predicate of the queries module, so a pure test cannot
 * cover it. Runs only through `npm run test:db` (or with DB_TESTS=1), against
 * the local stack's DATABASE_URL (migration 063 applied); it creates a
 * throwaway accountant and deletes it (and everything under it, by cascade)
 * at the end. Not part of `npm test`, which never opens a database.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const enabled = process.env['DB_TESTS'] === '1' || process.env['npm_lifecycle_event'] === 'test:db';

describe('client lifecycle (DB)', { skip: enabled ? false : 'run with `npm run test:db` against the local database' }, () => {
  // Imported lazily so a plain `npm test` never opens a pool.
  let pool: typeof import('../src/db/pool.js')['pool'];
  let clients: typeof import('../src/db/queries/clients.js');
  let dashboard: typeof import('../src/db/queries/dashboard.js');
  let agentInstances: typeof import('../src/db/queries/agentInstances.js');
  let userId = '';
  let instanceId = '';
  const email = `lifecycle-${Date.now()}@test.invalid`;
  const phone = `+97250${String(Date.now()).slice(-7)}`;

  before(async () => {
    ({ pool } = await import('../src/db/pool.js'));
    clients = await import('../src/db/queries/clients.js');
    dashboard = await import('../src/db/queries/dashboard.js');
    agentInstances = await import('../src/db/queries/agentInstances.js');
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, name) VALUES ($1, 'lifecycle test') RETURNING id`,
      [`owner-${Date.now()}@test.invalid`],
    );
    userId = rows[0]!.id;
    instanceId = (await agentInstances.enableInstance(userId, 'declaration_of_capital')).id;
  });

  after(async () => {
    if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  test('a deleted client vanishes from every live lookup, counts and summaries; delete twice is a no-op', async () => {
    const first = await clients.insert({ userId, agentInstanceId: instanceId, name: 'First', emailAddress: email, phone });
    assert.equal(first.deleted_at, null);
    assert.equal((await clients.getById(first.id))?.id, first.id);

    assert.equal(await clients.markDeleted(first.id, instanceId, userId), true);
    assert.equal(await clients.markDeleted(first.id, instanceId, userId), false, 'second delete changes nothing');
    assert.equal(await clients.markDeleted(first.id, '00000000-0000-0000-0000-000000000000', userId), false);

    assert.equal(await clients.getById(first.id), null);
    assert.equal(await clients.getByIdForUser(first.id, userId), null);
    assert.equal(await clients.getByIdForInstance(first.id, instanceId), null);
    assert.equal(await clients.getByEmailAddressForUser(userId, email), null);
    assert.equal(await clients.getByEmailAddressForInstance(instanceId, email), null);
    assert.equal(await clients.getByWaPhoneForInstance(instanceId, phone), null);
    assert.ok(!(await clients.listForUser(userId)).some((c) => c.id === first.id));
    assert.ok(!(await clients.listForInstance(instanceId)).some((c) => c.id === first.id));
    assert.ok(!(await clients.listOverdueForAgentTypes('2999-12-31', ['declaration_of_capital'])).some((c) => c.id === first.id));
    assert.equal(await clients.markOverdueStopped(first.id), null);
    assert.ok(!(await dashboard.listClientSummariesForInstance(instanceId)).some((c) => c.id === first.id));
    assert.ok(!(await dashboard.listClientSummaries(userId)).some((c) => c.id === first.id));
    const counted = (await agentInstances.listAllWithClientCounts()).find((i) => i.id === instanceId);
    assert.equal(counted?.client_count, 0);

    // The admin readers still see it, with the deletion stamped.
    const any = await clients.getAnyById(first.id);
    assert.ok(any?.deleted_at instanceof Date);
    assert.equal(any?.deleted_by, userId);
    assert.equal((await clients.getByIdForInstance(first.id, instanceId, { includeDeleted: true }))?.id, first.id);
    const deleted = await clients.listDeletedForInstance(instanceId);
    assert.deepEqual(deleted.map((c) => c.id), [first.id]);
    assert.equal(deleted[0]?.deleted_by_name, 'lifecycle test');
  });

  test('the same email and phone can be added again as a new client; two live clients still cannot share them', async () => {
    const again = await clients.insert({ userId, agentInstanceId: instanceId, name: 'Again', emailAddress: email, phone });
    const earlier = (await clients.listDeletedForInstance(instanceId))[0];
    assert.ok(earlier && earlier.id !== again.id, 'a brand-new id');
    assert.equal(again.wa_phone, phone, 'the phone is the new client\'s WhatsApp number');
    assert.equal(again.deleted_at, null);
    assert.equal((await clients.getByWaPhoneForInstance(instanceId, phone))?.id, again.id);
    assert.equal((await clients.getByEmailAddressForInstance(instanceId, email))?.id, again.id);
    assert.equal(earlier.email_address, email, 'the deleted record keeps its own address');

    // A live duplicate email is still refused by the index.
    await assert.rejects(
      clients.insert({ userId, agentInstanceId: instanceId, name: 'Dup', emailAddress: email, phone: null }),
      (err: unknown) => (err as { constraint?: string }).constraint === 'clients_instance_email_address_key',
    );
    // A live duplicate phone falls back to "no WhatsApp", as before.
    const noWa = await clients.insert({
      userId,
      agentInstanceId: instanceId,
      name: 'Dup phone',
      emailAddress: `other-${Date.now()}@test.invalid`,
      phone,
    });
    assert.equal(noWa.wa_phone, null);
  });
});
