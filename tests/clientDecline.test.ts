import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  DECLINE_BUTTON_TEXT,
  declineAckBodies,
  declineAckDelivery,
  declineAckText,
  declineContact,
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

const ACCOUNTANT = { name: 'Arie Rotem', email: 'a@x.il', hebrew_name: 'אריה רותם' };
const ADVISOR = { name: 'דנה לוי', email: 'dana@office.co.il', monday_user_id: '7', match: 'staff' };
const withAdvisor = (advisor: Record<string, unknown> | null = ADVISOR) => ({ name: 'ישראל כהן', agent_fields: advisor ? { tax_advisor: advisor } : {} });

test('declineContact: the stored advisor and their email; the accountant only when no advisor, the accountant email when the advisor has none', () => {
  assert.deepEqual(declineContact(withAdvisor(), ACCOUNTANT), { name: 'דנה לוי', email: 'dana@office.co.il' });
  assert.deepEqual(declineContact(withAdvisor({ ...ADVISOR, email: null }), ACCOUNTANT), { name: 'דנה לוי', email: 'a@x.il' });
  assert.deepEqual(declineContact(withAdvisor(null), ACCOUNTANT), { name: 'אריה רותם', email: 'a@x.il' });
  assert.deepEqual(declineContact(withAdvisor(null), null), { name: 'המטפל בתיק', email: null });
});

test('declineAckText names the client by first name, the advisor and the email, asks to send the documents there, and lists what is missing', () => {
  const text = declineAckText(withAdvisor(), ACCOUNTANT, ['דוח שנתי מבנק הפועלים', 'אישור יתרות קופת גמל']);
  assert.ok(text.startsWith('הבנתי, תודה ישראל.'));
  assert.ok(text.includes('לא אשלח עוד הודעות'));
  assert.ok(text.includes('בידי דנה לוי'));
  assert.ok(text.includes('למייל dana@office.co.il'));
  assert.ok(!text.includes('אריה רותם'));
  assert.ok(text.includes('המסמכים שעדיין חסרים:'));
  assert.ok(text.includes('• דוח שנתי מבנק הפועלים'));
  assert.ok(text.includes('• אישור יתרות קופת גמל'));
  // A test client (no advisor) is sent to the accountant.
  const fallback = declineAckText(withAdvisor(null), ACCOUNTANT, ['א']);
  assert.ok(fallback.includes('בידי אריה רותם'));
  assert.ok(fallback.includes('למייל a@x.il'));
  assert.ok(declineAckText({ name: '', agent_fields: {} }, null, []).startsWith('הבנתי, תודה.'));
});

test('declineAckText lists every missing document (no cap) and leaves the list out when nothing is missing', () => {
  const eighteen = Array.from({ length: 18 }, (_, i) => `מסמך מספר ${i + 1}`);
  const text = declineAckText(withAdvisor(), ACCOUNTANT, eighteen);
  for (const name of eighteen) assert.ok(text.includes(`• ${name}`), name);
  assert.ok(!text.includes('ועוד'));
  const none = declineAckText(withAdvisor(), ACCOUNTANT, []);
  assert.ok(!none.includes('המסמכים שעדיין חסרים'));
  assert.ok(!none.includes('•'));
  assert.ok(none.includes('למייל dana@office.co.il'));
});

test('declineAckBodies splits into the sentences and then the list when the whole passes the WhatsApp limit', () => {
  const many = Array.from({ length: 60 }, (_, i) => `אישור יתרה לסוף שנה מחברת הביטוח מספר ${i + 1} עבור הפוליסה`);
  const bodies = declineAckBodies(withAdvisor(), ACCOUNTANT, many);
  assert.ok(bodies.length >= 2);
  assert.ok(bodies[0]!.includes('למייל dana@office.co.il'));
  assert.ok(!bodies[0]!.includes('•'));
  assert.ok(bodies[1]!.startsWith('המסמכים שעדיין חסרים:'));
  for (const b of bodies) assert.ok(b.length <= 1600, `body of ${b.length} chars`);
  const joined = bodies.join('\n');
  for (const name of many) assert.ok(joined.includes(`• ${name}`), name);
  // A short list stays one body.
  assert.equal(declineAckBodies(withAdvisor(), ACCOUNTANT, ['א', 'ב']).length, 1);
});

test('declineAckDelivery needs an open window, a sender and a number', () => {
  const client = { name: 'דנה', wa_phone: '+972501234567', agent_fields: {} };
  const sender = { phone_number: '+97231234567' };
  const d = declineAckDelivery(client, null, { allowed: true, windowOpen: true }, sender, ['א']);
  assert.equal(d.send, true);
  assert.deepEqual(declineAckDelivery(client, null, { allowed: true, windowOpen: false }, sender, []), { send: false, reason: '24h window closed' });
  assert.equal(declineAckDelivery(client, null, { allowed: true, windowOpen: true }, null, []).send, false);
  assert.equal(declineAckDelivery({ ...client, wa_phone: null }, null, { allowed: true, windowOpen: true }, sender, []).send, false);
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

function harness(opts: { claim?: boolean; windowOpen?: boolean; sender?: boolean; sendFails?: boolean; advisor?: boolean; listFails?: boolean } = {}) {
  const client = {
    id: 'c1',
    name: 'ישראל כהן',
    wa_phone: '+972501234567',
    wa_enabled: true,
    user_id: 'u1',
    agent_instance_id: 'i1',
    paused: false,
    goal_status: 'pending',
    agent_fields: opts.advisor ? { tax_advisor: ADVISOR } : {},
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
      return opts.claim === false
        ? null
        : ({ ...client, paused: true, agent_fields: { ...client.agent_fields, declined_at: '2026-11-01T10:00:00Z' } } as ClientRow);
    },
    syncDocumentsStatus: async (id) => {
      calls.push(`syncDocumentsStatus:${id}`);
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
    listDocuments: async () => {
      calls.push('listDocuments:c1');
      if (opts.listFails) throw new Error('db down');
      return [
        { name: 'אישור יתרה בנק', status: 'pending' },
        { name: 'רישיון רכב', status: 'approved' },
      ];
    },
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
  assert.deepEqual(h.calls, ['markDeclined:c1', 'syncDocumentsStatus:c1', 'removeFutureEmail:c1', 'clearDraftingState:c1', 'listDocuments:c1', 'publish:c1']);
  assert.equal(h.texts.length, 1);
  // No advisor stored (a test client): the accountant is named, with the login email, and the missing list follows.
  assert.ok(h.texts[0]!.includes('בידי אריה רותם'));
  assert.ok(h.texts[0]!.includes('למייל a@x.il'));
  assert.ok(h.texts[0]!.includes('• אישור יתרה בנק'));
  assert.ok(!h.texts[0]!.includes('רישיון רכב'));
  assert.deepEqual(h.emailsSent, [['אישור יתרה בנק']]);
  const actions = h.audits.map((a) => a.action);
  assert.deepEqual(actions, ['client.declined', 'send_decline_ack']);
  assert.equal(h.audits[0]!.detail?.['source'], 'button');
  assert.equal(h.audits[1]!.detail?.['emailId'], 'msg-ack');
});

test('with a stored advisor the ack names the advisor and their email, not the accountant; the trace counts the missing items', async () => {
  const h = harness({ advisor: true });
  await handleClientDeclineWith(h.ctx, 'button', h.deps);
  assert.equal(h.texts.length, 1);
  assert.ok(h.texts[0]!.includes('בידי דנה לוי'));
  assert.ok(h.texts[0]!.includes('למייל dana@office.co.il'));
  assert.ok(!h.texts[0]!.includes('אריה רותם'));
  assert.ok(h.texts[0]!.includes('• אישור יתרה בנק'));
  const step = h.audits.find((a) => a.action === 'send_decline_ack');
  assert.equal(step?.detail?.['emailId'], 'msg-ack');
  assert.equal(step?.detail?.['missingCount'], 1);
});

test('a failed document-list read still sends the ack (without the list) and the email reads again', async () => {
  const h = harness({ advisor: true, listFails: true });
  const out = await handleClientDeclineWith(h.ctx, 'button', h.deps);
  assert.deepEqual(out, { handled: true, ackSent: true });
  assert.equal(h.texts.length, 1);
  assert.ok(h.texts[0]!.includes('למייל dana@office.co.il'));
  assert.ok(!h.texts[0]!.includes('•'));
  assert.equal(h.calls.filter((c) => c === 'listDocuments:c1').length, 2);
  assert.equal(h.emailsSent.length, 0); // the second read failed too: the email catch logs, the stop stands
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
