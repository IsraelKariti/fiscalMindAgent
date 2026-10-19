import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { sendToAccountantWith, type NotifyAccountantDeps } from '../src/agents/declarationOfCapital/notifyAccountantCore.js';
import type { AuditEvent } from '../src/audit/audit.js';

// openspec `conversation-trace` (accountant-email-in-trace): every accountant
// notification is recorded in full on the client's trace, and a refused send
// records its own warning row before the error reaches the caller.

const client = { id: 'c1', name: 'דני לוי', user_id: 'u1', agent_instance_id: 'i1' };

function harness(send: NotifyAccountantDeps['sendEmail']) {
  const audits: AuditEvent[] = [];
  const sent: Parameters<NotifyAccountantDeps['sendEmail']>[0][] = [];
  const deps: NotifyAccountantDeps = {
    from: 'FiscalMind <no-reply@agents.example>',
    getUser: async () => ({ email: 'acc@example.com' }),
    sendEmail: async (args) => {
      sent.push(args);
      return send(args);
    },
    recordAudit: (e) => {
      audits.push(e);
    },
  };
  return { deps, audits, sent };
}

test('a sent notification records kind, recipient, subject, body and the provider id', async () => {
  const h = harness(async () => ({ resendId: 're_123' }));
  await sendToAccountantWith(client, 'goal_complete', 'כל המסמכים של דני לוי התקבלו', 'שלום,\n\nהכל התקבל.', h.deps);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.from, 'FiscalMind <no-reply@agents.example>');
  assert.equal(h.sent[0]!.to, 'acc@example.com');
  assert.equal(h.audits.length, 1);
  const row = h.audits[0]!;
  assert.equal(row.action, 'email.accountant_sent');
  assert.equal(row.clientId, 'c1');
  assert.equal(row.agentInstanceId, 'i1');
  assert.equal(row.targetType, 'email');
  assert.deepEqual(row.detail, {
    clientName: 'דני לוי',
    kind: 'goal_complete',
    to: 'acc@example.com',
    subject: 'כל המסמכים של דני לוי התקבלו',
    body: 'שלום,\n\nהכל התקבל.',
    resendId: 're_123',
  });
});

test('a fence-blocked send is recorded with its stand-in id', async () => {
  const h = harness(async () => ({ resendId: 'blocked-7f0a' }));
  await sendToAccountantWith(client, 'overdue', 'נושא', 'גוף', h.deps);
  assert.equal(h.audits[0]!.detail?.['resendId'], 'blocked-7f0a');
});

test('a refused send records a warning row with the content and the error, then rethrows', async () => {
  const h = harness(async () => {
    throw new Error('Resend send failed: validation_error bad domain');
  });
  await assert.rejects(
    () => sendToAccountantWith(client, 'claimed_documents', 'נושא', 'גוף ההודעה', h.deps),
    /Resend send failed/,
  );
  assert.equal(h.audits.length, 1);
  const row = h.audits[0]!;
  assert.equal(row.action, 'email.accountant_failed');
  assert.equal(row.severity, 'warning');
  assert.deepEqual(row.detail, {
    clientName: 'דני לוי',
    kind: 'claimed_documents',
    to: 'acc@example.com',
    subject: 'נושא',
    body: 'גוף ההודעה',
    error: 'Resend send failed: validation_error bad domain',
  });
});

test('a client without an owner or with a missing user sends and records nothing', async () => {
  const h = harness(async () => ({ resendId: 're_1' }));
  await sendToAccountantWith({ ...client, user_id: null }, 'goal_complete', 'נושא', 'גוף', h.deps);
  h.deps.getUser = async () => null;
  await sendToAccountantWith(client, 'goal_complete', 'נושא', 'גוף', h.deps);
  assert.equal(h.sent.length, 0);
  assert.equal(h.audits.length, 0);
});
