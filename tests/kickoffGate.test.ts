import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { kickoffBlockReason, refuseKickoffWith, KICKOFF_BLOCKED_NOTE } from '../src/agents/declarationOfCapital/kickoffGate.js';
import type { StoredTaxAdvisor } from '../src/agents/declarationOfCapital/taxAdvisor.js';

const advisor = (over: Partial<StoredTaxAdvisor> = {}): StoredTaxAdvisor => ({
  name: 'דנה לוי',
  email: 'dana@office.co.il',
  monday_user_id: '7',
  match: 'staff',
  ...over,
});

test('kickoffBlockReason: column unmapped, cell empty and email unavailable each refuse; any match with an email passes', () => {
  assert.equal(kickoffBlockReason(undefined), 'advisor_column_unmapped');
  assert.equal(kickoffBlockReason(null), 'advisor_cell_empty');
  assert.equal(kickoffBlockReason(advisor({ email: null })), 'advisor_email_unavailable');
  assert.equal(kickoffBlockReason(advisor({ email: '  ' })), 'advisor_email_unavailable');
  assert.equal(kickoffBlockReason(advisor()), null);
  assert.equal(kickoffBlockReason(advisor({ match: 'none' })), null);
  assert.equal(kickoffBlockReason(advisor({ match: 'accountant' })), null);
});

test('refuseKickoffWith stamps the client, records client.kickoff_refused with the reason and tells the workspace', async () => {
  const calls: string[] = [];
  let audit: Record<string, unknown> | null = null;
  await refuseKickoffWith(
    { client: { id: 'c1', name: 'ישראל כהן' }, instanceId: 'i1', accountantUserId: 'u1', boardId: 'b1', itemId: 'it1' },
    'advisor_cell_empty',
    {
      setKickoffBlocked: async (id, reason) => {
        calls.push(`blocked:${id}:${reason}`);
      },
      recordAudit: (entry) => {
        audit = entry as unknown as Record<string, unknown>;
        calls.push('audit');
      },
      publishClientUpdated: (id) => calls.push(`publish:${id}`),
    },
  );
  assert.deepEqual(calls, ['blocked:c1:advisor_cell_empty', 'audit', 'publish:c1']);
  const a = audit as unknown as { action: string; actorType: string; actorUserId: string; clientId: string; detail: Record<string, unknown> };
  assert.equal(a.action, 'client.kickoff_refused');
  assert.equal(a.actorType, 'accountant');
  assert.equal(a.actorUserId, 'u1');
  assert.equal(a.clientId, 'c1');
  assert.equal(a.detail['reason'], 'advisor_cell_empty');
  assert.equal(a.detail['note'], KICKOFF_BLOCKED_NOTE.advisor_cell_empty);
  assert.equal(a.detail['boardId'], 'b1');
  assert.equal(a.detail['itemId'], 'it1');
});
