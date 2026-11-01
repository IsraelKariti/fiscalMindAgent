import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  DECLINE_BUTTON_TEXT,
  declineAckDelivery,
  declineAckText,
  handleClientDeclineWith,
  isDeclineButton,
  missingDocumentNames,
  type ClientDeclineDeps,
} from '../src/agents/declarationOfCapital/clientDeclineRules.js';
import type { AuditEvent } from '../src/audit/audit.js';
import type { AgentContext } from '../src/agents/types.js';
import type { ClientRow, UserRow } from '../src/db/types.js';

// openspec `client-decline`: the intro template's decline button (payload or
// exact text) is recognised in code; the routine sends one fixed
// acknowledgement, pauses the client, drops the pending send, emails the
// accountant once, and does nothing on a second decline.

const wa = { channel: 'whatsapp' as const, isNewMessage: true };

test('isDeclineButton: the tap payload, or the exact button text, on a new WhatsApp message only', () => {
  assert.equal(isDeclineButton({ ...wa, buttonPayload: 'decline' }, 'whatever'), true);
  assert.equal(isDeclineButton({ ...wa, buttonPayload: null }, DECLINE_BUTTON_TEXT), true);
  assert.equal(isDeclineButton({ ...wa, buttonPayload: null }, `  ${DECLINE_BUTTON_TEXT}! `), true);
  assert.equal(isDeclineButton({ ...wa, buttonPayload: 'start' }, 'נתחיל כאן בוואטסאפ'), false);
  assert.equal(isDeclineButton({ ...wa, buttonPayload: null }, 'לא עכשיו'), false);
  assert.equal(isDeclineButton({ ...wa, buttonPayload: null }, null), false);
  assert.equal(isDeclineButton({ ...wa, isNewMessage: false, buttonPayload: 'decline' }, DECLINE_BUTTON_TEXT), false);
  assert.equal(isDeclineButton({ channel: 'email', isNewMessage: true, buttonPayload: null }, DECLINE_BUTTON_TEXT), false);
});

test('declineAckText names the client by first name and the accountant, and says the assistant stops', () => {
  const text = declineAckText({ name: 'ישראל כהן' }, { name: 'Arie Rotem', email: 'a@x.il', hebrew_name: 'אריה רותם' });
  assert.ok(text.startsWith('הבנתי, תודה ישראל.'));
  assert.ok(text.includes('לא אשלח עוד הודעות'));
  assert.ok(text.includes('רואה החשבון אריה רותם'));
  assert.ok(declineAckText({ name: '' }, null).startsWith('הבנתי, תודה.'));
});

test('declineAckDelivery needs an open window, a sender and a number', () => {
  const client = { name: 'דנה', wa_phone: '+972501234567' };
  const sender = { phone_number: '+97231234567' };
  const d = declineAckDelivery(client, null, { allowed: true, windowOpen: true }, sender);
  assert.equal(d.send, true);
  assert.deepEqual(declineAckDelivery(client, null, { allowed: true, windowOpen: false }, sender), { send: false, reason: '24h window closed' });
  assert.equal(declineAckDelivery(client, null, { allowed: true, windowOpen: true }, null).send, false);
  assert.equal(declineAckDelivery({ ...client, wa_phone: null }, null, { allowed: true, windowOpen: true }, sender).send, false);
});

test('missingDocumentNames lists pending and unresolved rows only', () => {
  assert.deepEqual(
    missingDocumentNames([
      { name: 'א', status: 'pending' },
      { name: 'ב', status: 'approved' },
      { name: 'ג', status: 'unresolved' },
      { name: 'ד', status: 'not_required' },
    ]),
    ['א', 'ג'],
  );
});

function harness(opts: { claim?: boolean; windowOpen?: boolean; sender?: boolean; sendFails?: boolean } = {}) {
  const client = {
    id: 'c1',
    name: 'ישראל כהן',
    wa_phone: '+972501234567',
    wa_enabled: true,
    user_id: 'u1',
    agent_instance_id: 'i1',
    paused: false,
    goal_status: 'pending',
    agent_fields: {},
  } as unknown as ClientRow;
  const accountant = { name: 'Arie', email: 'a@x.il', hebrew_name: 'אריה רותם' } as unknown as UserRow;
  const ctx = { instance: null, client, accountant } as unknown as AgentContext;
  const calls: string[] = [];
  const audits: AuditEvent[] = [];
  const emailsSent: string[][] = [];
  const texts: string[] = [];
  const deps: ClientDeclineDeps = {
    markDeclined: async (id) => {
      calls.push(`markDeclined:${id}`);
      return opts.claim === false ? null : ({ ...client, paused: true, agent_fields: { declined_at: '2026-11-01T10:00:00Z' } } as ClientRow);
    },
    removeFutureEmail: async (id) => {
      calls.push(`removeFutureEmail:${id}`);
    },
    clearDraftingState: async (id) => {
      calls.push(`clearDraftingState:${id}`);
    },
    channelState: async () => ({ allowed: true, windowOpen: opts.windowOpen ?? true }),
    getSender: async () => (opts.sender === false ? null : { phone_number: '+97231234567' }),
    sendText: async (_id, args) => {
      if (opts.sendFails) throw new Error('twilio down');
      texts.push(args.body);
      return { id: 'msg-ack' };
    },
    listDocuments: async () => [
      { name: 'אישור יתרה בנק', status: 'pending' },
      { name: 'רישיון רכב', status: 'approved' },
    ],
    sendDeclinedEmail: async (_c, missing) => {
      emailsSent.push(missing);
    },
    recordAudit: (e) => {
      audits.push(e);
    },
    publishClientUpdated: (id) => {
      calls.push(`publish:${id}`);
    },
    now: () => new Date('2026-11-01T10:00:00Z'),
  };
  return { ctx, deps, calls, audits, emailsSent, texts };
}

test('a decline pauses the client, drops the pending send, sends the ack once, emails the missing documents', async () => {
  const h = harness();
  const out = await handleClientDeclineWith(h.ctx, 'button', h.deps);
  assert.deepEqual(out, { handled: true, ackSent: true });
  assert.deepEqual(h.calls, ['markDeclined:c1', 'removeFutureEmail:c1', 'clearDraftingState:c1', 'publish:c1']);
  assert.equal(h.texts.length, 1);
  assert.ok(h.texts[0]!.includes('אריה רותם'));
  assert.deepEqual(h.emailsSent, [['אישור יתרה בנק']]);
  const actions = h.audits.map((a) => a.action);
  assert.deepEqual(actions, ['client.declined', 'send_decline_ack']);
  assert.equal(h.audits[0]!.detail?.['source'], 'button');
  assert.equal(h.audits[1]!.detail?.['emailId'], 'msg-ack');
});

test('a second decline (claim refused) does nothing: no ack, no email, no audit', async () => {
  const h = harness({ claim: false });
  const out = await handleClientDeclineWith(h.ctx, 'planner', h.deps);
  assert.deepEqual(out, { handled: false, ackSent: false });
  assert.deepEqual(h.calls, ['markDeclined:c1']);
  assert.equal(h.texts.length, 0);
  assert.equal(h.emailsSent.length, 0);
  assert.equal(h.audits.length, 0);
});

test('no sender: the ack is skipped with the reason, the stop and the email still happen', async () => {
  const h = harness({ sender: false });
  const out = await handleClientDeclineWith(h.ctx, 'button', h.deps);
  assert.deepEqual(out, { handled: true, ackSent: false });
  assert.equal(h.texts.length, 0);
  assert.equal(h.emailsSent.length, 1);
  const step = h.audits.find((a) => a.action === 'send_decline_ack');
  assert.equal(step?.detail?.['skipped'], 'no whatsapp sender on the instance');
});

test('a provider failure on the ack is recorded as skipped and does not stop the hand-off', async () => {
  const h = harness({ sendFails: true });
  const out = await handleClientDeclineWith(h.ctx, 'planner', h.deps);
  assert.deepEqual(out, { handled: true, ackSent: false });
  assert.equal(h.emailsSent.length, 1);
  const step = h.audits.find((a) => a.action === 'send_decline_ack');
  assert.equal(step?.detail?.['skipped'], 'send failed');
});
