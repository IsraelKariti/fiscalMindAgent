/**
 * Google sign-in matched by email (openspec `google-sign-in`) against a real
 * database — the behaviour lives in SQL (lower(email) match, ON CONFLICT on
 * the email, the signed-in predicate), so a pure test cannot cover it. Runs
 * only through `npm run test:db` (or with DB_TESTS=1) against the local
 * stack's DATABASE_URL with migration 069 applied; every row it creates uses a
 * unique @test.invalid address and is deleted at the end. Not part of
 * `npm test`, which never opens a database.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const enabled = process.env['DB_TESTS'] === '1' || process.env['npm_lifecycle_event'] === 'test:db';

describe('sign-in by email (DB)', { skip: enabled ? false : 'run with `npm run test:db` against the local database' }, () => {
  let pool: typeof import('../src/db/pool.js')['pool'];
  let users: typeof import('../src/db/queries/users.js');
  const stamp = Date.now();
  const emails: string[] = [];
  const fresh = (tag: string): string => {
    const e = `${tag}-${stamp}@test.invalid`;
    emails.push(e);
    return e;
  };

  before(async () => {
    ({ pool } = await import('../src/db/pool.js'));
    users = await import('../src/db/queries/users.js');
  });

  after(async () => {
    await pool.query('DELETE FROM users WHERE lower(email) = ANY($1)', [emails.map((e) => e.toLowerCase())]);
    await pool.end();
  });

  test('new email creates a row; a second sign-in with other casing updates the same row', async () => {
    const email = fresh('new');
    const first = await users.signInByEmail({ googleSub: `sub-a-${stamp}`, email, name: 'A', pictureUrl: null });
    assert.equal(first.google_sub, `sub-a-${stamp}`);
    assert.equal(await users.hasSignedIn(email), true);

    const upper = email.toUpperCase();
    emails.push(upper);
    const again = await users.signInByEmail({ googleSub: `sub-a-${stamp}`, email: upper, name: 'A2', pictureUrl: null });
    assert.equal(again.id, first.id, 'same row, matched case-insensitively');
    assert.equal(again.name, 'A2');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM users WHERE lower(email) = lower($1)', [email]);
    assert.equal(rows[0].n, 1);
  });

  test('an invited row (google_sub NULL) is taken over', async () => {
    const email = fresh('invited');
    const invited = await users.createInvited(email, 'Invited');
    assert.ok(invited);
    assert.equal(await users.hasSignedIn(email), false);
    const signed = await users.signInByEmail({ googleSub: `sub-i-${stamp}`, email, name: 'Invited', pictureUrl: null });
    assert.equal(signed.id, invited.id);
    assert.equal(signed.google_sub, `sub-i-${stamp}`);
    assert.equal(await users.hasSignedIn(email), true);
  });

  test('a monday-provisioned row (placeholder sub) counts as not signed in and is taken over', async () => {
    const email = fresh('monday');
    const provisioned = await users.createFromMonday({ email, name: 'From monday', placeholderSub: `monday:${stamp}:1` });
    assert.equal(await users.hasSignedIn(email), false, 'placeholder sub is not a sign-in');
    const signed = await users.signInByEmail({ googleSub: `sub-m-${stamp}`, email, name: 'Real', pictureUrl: null });
    assert.equal(signed.id, provisioned.id, 'same row — this was the 2026-10-28 production crash');
    assert.equal(signed.google_sub, `sub-m-${stamp}`);
    assert.equal(await users.hasSignedIn(email), true);
  });

  test('the same Google sub under a renamed address becomes a new row (sub is not unique)', async () => {
    const sub = `sub-r-${stamp}`;
    const old = await users.signInByEmail({ googleSub: sub, email: fresh('old'), name: null, pictureUrl: null });
    const renamed = await users.signInByEmail({ googleSub: sub, email: fresh('renamed'), name: null, pictureUrl: null });
    assert.notEqual(renamed.id, old.id);
    assert.equal(renamed.google_sub, sub);
  });

  test('createFromMonday refuses a non-placeholder sub', async () => {
    await assert.rejects(users.createFromMonday({ email: fresh('bad'), name: null, placeholderSub: 'real-sub' }));
  });
});
