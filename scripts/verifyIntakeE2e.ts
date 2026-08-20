/**
 * Phase-5 API-level e2e for the capital-declaration intake surface, against
 * the running dev stack. Deliberately LLM-free and send-free: the test client
 * is created paused directly in the DB (no draftFirstEmail), only document
 * PATCH transitions are exercised, and the client is deleted at the end.
 * The session cookie stays in memory — never printed.
 */
import crypto from 'node:crypto';
import * as clients from '../src/db/queries/clients.js';
import * as clientDocuments from '../src/db/queries/clientDocuments.js';
import { catalogSeedRows } from '../src/agents/declarationOfCapital/catalog.js';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

const BASE = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
const TEST_EMAIL = 'intake-e2e-throwaway@example.invalid';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok - ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL - ${label}`, detail ?? '');
  }
}

function mintCookie(userId: string): string {
  // Same fallback chain as src/api/auth.ts (dev may run without a dedicated secret).
  const secret = env.DASHBOARD_SESSION_SECRET;
  if (!secret) throw new Error('DASHBOARD_SESSION_SECRET is not set — cannot mint a session cookie');
  const expiresAt = String(Date.now() + 10 * 60 * 1000);
  const payload = `${userId}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `fm_session=${payload}.${sig}`;
}

async function main() {
  // 1. Find an enabled declaration_of_capital instance.
  const { rows: instances } = await pool.query(
    `SELECT id, user_id FROM agent_instances WHERE agent_type = 'declaration_of_capital' AND enabled = true LIMIT 1`,
  );
  const instance = instances[0];
  if (!instance) {
    console.error('SKIP: no enabled declaration_of_capital instance in the dev DB');
    process.exit(2);
  }
  const cookie = mintCookie(instance.user_id);
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${BASE}/api/agents/${instance.id}${path}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* some responses are empty */
    }
    return { status: res.status, json };
  };

  // 2. Create the test client PAUSED (no drafting, no sends) and seed it the
  //    way enrollment does — through the real catalog + insert path.
  const stale = await pool.query(`SELECT id FROM clients WHERE email_address = $1`, [TEST_EMAIL]);
  for (const row of stale.rows) await pool.query(`DELETE FROM clients WHERE id = $1`, [row.id]);
  const client = await clients.insert({
    userId: instance.user_id,
    agentInstanceId: instance.id,
    name: 'בדיקת אינטייק',
    emailAddress: TEST_EMAIL,
    paused: true,
  });
  for (const doc of catalogSeedRows(2025)) {
    await clientDocuments.insert({
      clientId: client.id,
      name: doc.name,
      description: doc.description,
      typeKey: doc.typeKey,
      status: 'unresolved',
    });
  }

  try {
    // 3. The API lists the seeded intake rows.
    const list = await api('GET', `/clients/${client.id}/documents`);
    const docs: any[] = list.json?.documents ?? [];
    check('GET documents returns the seeded catalog', list.status === 200 && docs.length === catalogSeedRows(2025).length);
    check('all rows start unresolved with a type_key', docs.every((d) => d.status === 'unresolved' && d.type_key));

    const [a, b, c] = docs;

    // 4. Accountant transitions the router must allow.
    const toPending = await api('PATCH', `/clients/${client.id}/documents/${a.id}`, { status: 'pending' });
    check('unresolved → pending allowed', toPending.status === 200 && toPending.json.document.status === 'pending');
    const toNotRequired = await api('PATCH', `/clients/${client.id}/documents/${b.id}`, { status: 'not_required' });
    check('unresolved → not_required allowed', toNotRequired.status === 200);
    const backToPending = await api('PATCH', `/clients/${client.id}/documents/${b.id}`, { status: 'pending' });
    check('not_required → pending (reopen) allowed', backToPending.status === 200);
    const toCollected = await api('PATCH', `/clients/${client.id}/documents/${a.id}`, { status: 'collected' });
    check('pending → collected allowed', toCollected.status === 200);
    const manualApprove = await api('PATCH', `/clients/${client.id}/documents/${a.id}`, { status: 'approved' });
    check('collected → approved (manual override) allowed', manualApprove.status === 200);

    // 5. Transitions the router must refuse.
    const pendingToApproved = await api('PATCH', `/clients/${client.id}/documents/${b.id}`, { status: 'approved' });
    check('pending → approved refused (400)', pendingToApproved.status === 400);
    const unresolvedToCollected = await api('PATCH', `/clients/${client.id}/documents/${c.id}`, { status: 'collected' });
    check('unresolved → collected refused (400)', unresolvedToCollected.status === 400);

    // 6. A manual change on an unsettled list voids a standing attestation.
    await pool.query(
      `UPDATE clients SET agent_fields = agent_fields ||
         '{"attestation_request_email_id":"e2e","attestation_confirmed_at":"2026-08-20T00:00:00Z"}'::jsonb
       WHERE id = $1`,
      [client.id],
    );
    const reopen = await api('PATCH', `/clients/${client.id}/documents/${a.id}`, { status: 'pending' });
    check('approved → pending (reopen) allowed', reopen.status === 200);
    const { rows: after } = await pool.query(`SELECT agent_fields FROM clients WHERE id = $1`, [client.id]);
    check(
      'reopen voided the stale attestation',
      after[0] && !('attestation_confirmed_at' in after[0].agent_fields) && !('attestation_request_email_id' in after[0].agent_fields),
    );

    // 7. Goal stayed open throughout (nothing here may complete it or schedule sends).
    const { rows: goal } = await pool.query(`SELECT goal_status, paused FROM clients WHERE id = $1`, [client.id]);
    check('client stayed pending + paused', goal[0]?.goal_status === 'pending' && goal[0]?.paused === true);

    // 8. Capital-only statuses are refused on a doc_collector instance (read-only 400 — no mutation).
    const { rows: dcClients } = await pool.query(
      `SELECT c.id AS client_id, c.agent_instance_id, d.id AS doc_id, ai.user_id
       FROM clients c
       JOIN agent_instances ai ON ai.id = c.agent_instance_id AND ai.agent_type = 'doc_collector' AND ai.enabled = true
       JOIN client_documents d ON d.client_id = c.id
       LIMIT 1`,
    );
    if (dcClients[0]) {
      const dc = dcClients[0];
      const res = await fetch(`${BASE}/api/agents/${dc.agent_instance_id}/clients/${dc.client_id}/documents/${dc.doc_id}`, {
        method: 'PATCH',
        headers: { cookie: mintCookie(dc.user_id), 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'not_required' }),
      });
      check('doc_collector refuses capital-only statuses (400)', res.status === 400);
    } else {
      console.log('  (skipped doc_collector cross-check — no doc_collector client with documents in dev DB)');
    }
  } finally {
    await pool.query(`DELETE FROM clients WHERE id = $1`, [client.id]);
    console.log('  cleanup: test client deleted');
  }

  console.log(failures === 0 ? 'E2E PASS' : `E2E FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('E2E crashed', err);
  process.exit(1);
});
