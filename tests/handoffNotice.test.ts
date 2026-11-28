import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  handoffNoticeAdvisor,
  handoffNoticeDelivery,
  handoffNoticeSince,
  handoffNoticeVariables,
  renderTemplateBody,
  runHandoffNoticeScanWith as runHandoffNoticeScan,
  sendHandoffNoticeWith as sendHandoffNotice,
  type HandoffNoticeSendDeps,
} from '../src/agents/declarationOfCapital/handoffNotice.js';
import { sendWhatsAppTemplateAndRecord } from '../src/twilio/sendAndRecord.js';
import { isBlockedLocalDate } from '../src/agents/shared/sendAtGuard.js';
import { splitTemplatesByPurpose } from '../src/agents/declarationOfCapital/templatePurpose.js';
import { normalizeFollowUpMessage, type DecisionContext } from '../src/agents/declarationOfCapital/decisionSchema.js';
import type { ClientRow, EmailRow, WaTemplateRow } from '../src/db/types.js';

// openspec `handoff-notice`: one fixed template to the client on the business
// morning after the agent stopped at the end of the collection window.

const TZ = 'Asia/Jerusalem';
const accountant = { name: 'Arie Rotem', hebrew_name: 'אריה רותם', email: 'office@rotem.example' };
const sender = { phone_number: '+97231234567' };
const template = {
  content_sid: 'HXhandoff',
  body: 'שלום {{1}},\nהמסמכים מועברים ליועץ/ת המס {{2}}.\nאפשר לפנות במייל {{3}}.\nתודה!',
  variable_count: 3,
};

function client(fields: Record<string, unknown> = {}, over: Record<string, unknown> = {}): ClientRow {
  return { id: 'c1', name: 'ישראל ישראלי', wa_phone: '+972501234567', agent_instance_id: 'i1', agent_fields: fields, ...over } as unknown as ClientRow;
}

describe('who the notice names (handoffNoticeAdvisor)', () => {
  it('names the stored advisor when it has an email, matched or not', () => {
    const c = client({ tax_advisor: { name: 'דנה לוי', email: 'dana@office.example', match: 'none' } });
    assert.deepEqual(handoffNoticeAdvisor(c, accountant), { name: 'דנה לוי', email: 'dana@office.example' });
  });

  it('falls back to the accountant when no advisor is stored', () => {
    assert.deepEqual(handoffNoticeAdvisor(client(), accountant), { name: 'אריה רותם', email: 'office@rotem.example' });
  });

  it('falls back to the accountant when the advisor has no email', () => {
    const c = client({ tax_advisor: { name: 'דנה לוי', email: null, match: 'none' } });
    assert.deepEqual(handoffNoticeAdvisor(c, accountant), { name: 'אריה רותם', email: 'office@rotem.example' });
  });
});

describe('notice content', () => {
  it('fills the three variables in order: first name, advisor name, advisor email', () => {
    const c = client({ tax_advisor: { name: 'דנה לוי', email: 'dana@office.example' } });
    const variables = handoffNoticeVariables(c, accountant);
    assert.deepEqual(variables, ['ישראל', 'דנה לוי', 'dana@office.example']);
    assert.equal(
      renderTemplateBody(template.body, variables),
      'שלום ישראל,\nהמסמכים מועברים ליועץ/ת המס דנה לוי.\nאפשר לפנות במייל dana@office.example.\nתודה!',
    );
  });

  it('sends the template with sender, number and rendered text', () => {
    const d = handoffNoticeDelivery(client(), accountant, sender, template);
    assert.equal(d.send, true);
    if (d.send) {
      assert.equal(d.from, sender.phone_number);
      assert.equal(d.to, '+972501234567');
      assert.equal(d.contentSid, 'HXhandoff');
      assert.match(d.renderedBody, /אריה רותם/);
    }
  });

  it('skips with a reason when nothing can carry the notice', () => {
    assert.deepEqual(handoffNoticeDelivery(client(), accountant, sender, null), { send: false, reason: 'no handoff template registered' });
    assert.deepEqual(handoffNoticeDelivery(client(), accountant, null, template), { send: false, reason: 'no whatsapp sender on the instance' });
    assert.deepEqual(handoffNoticeDelivery(client({}, { wa_phone: null }), accountant, sender, template), {
      send: false,
      reason: 'client has no whatsapp number',
    });
    assert.equal(handoffNoticeDelivery(client(), null, sender, template).send, false); // no email to give
    assert.equal(handoffNoticeDelivery(client(), accountant, sender, { ...template, variable_count: 2 }).send, false);
  });
});

describe('business day (isBlockedLocalDate)', () => {
  it('blocks Friday, Saturday, a chag and an erev chag; allows an ordinary Sunday', () => {
    assert.equal(isBlockedLocalDate(new Date('2026-12-04T07:00:00Z'), TZ), true); // Friday
    assert.equal(isBlockedLocalDate(new Date('2026-12-05T07:00:00Z'), TZ), true); // Saturday
    assert.equal(isBlockedLocalDate(new Date('2026-12-06T07:00:00Z'), TZ), false); // Sunday
    assert.equal(isBlockedLocalDate(new Date('2026-09-13T07:00:00Z'), TZ), true); // Rosh Hashana 5787 day 2, a Sunday
    assert.equal(isBlockedLocalDate(new Date('2026-09-20T07:00:00Z'), TZ), true); // erev Yom Kippur, a Sunday
  });

  it('uses the local date: Thursday 23:30 UTC is already Friday in Israel', () => {
    assert.equal(isBlockedLocalDate(new Date('2026-12-03T23:30:00Z'), TZ), true);
    assert.equal(isBlockedLocalDate(new Date('2026-12-03T07:00:00Z'), TZ), false);
  });
});

function sendDeps(over: Partial<HandoffNoticeSendDeps> = {}): { deps: HandoffNoticeSendDeps; log: string[] } {
  const log: string[] = [];
  const deps: HandoffNoticeSendDeps = {
    adminPaused: async () => false,
    resolveDelivery: async (c) => handoffNoticeDelivery(c, accountant, sender, template),
    claim: async (id) => {
      log.push('claim');
      return client({}, { id });
    },
    release: async () => {
      log.push('release');
    },
    send: async () => {
      log.push('send');
    },
    published: () => {
      log.push('published');
    },
    ...over,
  };
  return { deps, log };
}

describe('sendHandoffNotice', () => {
  const now = new Date('2026-12-06T07:00:00Z');

  it('claims, sends and publishes', async () => {
    const { deps, log } = sendDeps();
    assert.deepEqual(await sendHandoffNotice(client(), now, deps), { sent: true });
    assert.deepEqual(log, ['claim', 'send', 'published']);
  });

  it('skips on an admin pause without claiming', async () => {
    const { deps, log } = sendDeps({ adminPaused: async () => true });
    assert.equal((await sendHandoffNotice(client(), now, deps)).sent, false);
    assert.deepEqual(log, []);
  });

  it('skips without claiming when nothing can carry the notice', async () => {
    const { deps, log } = sendDeps({ resolveDelivery: async () => ({ send: false, reason: 'no handoff template registered' }) });
    assert.deepEqual(await sendHandoffNotice(client(), now, deps), { sent: false, reason: 'no handoff template registered' });
    assert.deepEqual(log, []);
  });

  it('sends nothing when the claim fails (resumed, new due date, or already told)', async () => {
    const { deps, log } = sendDeps({ claim: async () => null });
    assert.equal((await sendHandoffNotice(client(), now, deps)).sent, false);
    assert.deepEqual(log, []);
  });

  it('gives the claim back when the provider refuses the send', async () => {
    const { deps, log } = sendDeps({
      send: async () => {
        throw new Error('twilio 63016');
      },
    });
    assert.deepEqual(await sendHandoffNotice(client(), now, deps), { sent: false, reason: 'send failed' });
    assert.deepEqual(log, ['claim', 'release']);
  });
});

describe('runHandoffNoticeScan', () => {
  const due = [client({}, { id: 'a' }), client({}, { id: 'b' })];
  const scanDeps = (calls: string[], killSwitch = false) => ({
    killSwitchOn: async () => killSwitch,
    listDue: async () => due,
    sendOne: async (c: ClientRow) => {
      calls.push(c.id);
      return { sent: true } as const;
    },
  });

  it('sends once per due client on a business day', async () => {
    const calls: string[] = [];
    const result = await runHandoffNoticeScan(new Date('2026-12-06T07:00:00Z'), TZ, scanDeps(calls));
    assert.deepEqual(calls, ['a', 'b']);
    assert.deepEqual(result, { due: 2, sent: 2 });
  });

  it('sends nothing on a Friday or with the kill switch on', async () => {
    const calls: string[] = [];
    await runHandoffNoticeScan(new Date('2026-12-04T07:00:00Z'), TZ, scanDeps(calls));
    await runHandoffNoticeScan(new Date('2026-12-06T07:00:00Z'), TZ, scanDeps(calls, true));
    assert.deepEqual(calls, []);
  });

  it('looks 7 days back', () => {
    assert.equal(handoffNoticeSince(new Date('2026-12-08T07:00:00.000Z')), '2026-12-01T07:00:00.000Z');
  });
});

describe('sendWhatsAppTemplateAndRecord', () => {
  it('sends, then records a sent row with the rendered text and the audit event', async () => {
    const log: string[] = [];
    let inserted: Record<string, unknown> = {};
    let audited: Record<string, unknown> = {};
    const row = await sendWhatsAppTemplateAndRecord(
      'c1',
      { from: '+1', to: '+2', contentSid: 'HXhandoff', variables: ['א', 'ב', 'ג'], renderedBody: 'טקסט מלא' },
      {
        send: async () => {
          log.push('send');
          return { sid: 'SM1' };
        },
        insertDraft: async (_id, args) => {
          log.push('insert');
          inserted = args;
          return { id: 'e1' } as EmailRow;
        },
        markSent: async (id, args) => {
          log.push(`sent:${id}:${args.messageId}`);
        },
        audit: ((event: Record<string, unknown>) => {
          audited = event;
        }) as never,
      },
    );
    assert.equal(row.id, 'e1');
    assert.deepEqual(log, ['send', 'insert', 'sent:e1:SM1']);
    assert.equal(inserted['body'], 'טקסט מלא');
    assert.equal(inserted['waContentSid'], 'HXhandoff');
    assert.equal(audited['action'], 'wa.template_sent');
  });

  it('records nothing when the provider refuses', async () => {
    const log: string[] = [];
    await assert.rejects(
      sendWhatsAppTemplateAndRecord(
        'c1',
        { from: '+1', to: '+2', contentSid: 'HX', variables: [], renderedBody: '' },
        {
          send: async () => {
            throw new Error('refused');
          },
          insertDraft: async () => {
            log.push('insert');
            return { id: 'e1' } as EmailRow;
          },
          markSent: async () => {},
          audit: (() => {}) as never,
        },
      ),
    );
    assert.deepEqual(log, []);
  });
});

// openspec `whatsapp-templates`: a handoff template is code-sent, never offered.
describe('handoff templates and the planner', () => {
  const base = { id: 't', body: 'x {{1}}', variable_count: 1, agent_type: 'declaration_of_capital', created_at: new Date() };
  const intro = { ...base, content_sid: 'HXintro', name: 'intro', purpose: 'intro' } as WaTemplateRow;
  const reopen = { ...base, content_sid: 'HXreopen', name: 'update', purpose: 'reopen' } as WaTemplateRow;
  const handoff = { ...base, content_sid: 'HXhandoff', name: 'handoff', purpose: 'handoff' } as WaTemplateRow;

  it('is neither offered nor listed as hidden, before or after first contact', () => {
    for (const firstContactDone of [false, true]) {
      const { templates, hiddenTemplates } = splitTemplatesByPurpose([intro, reopen, handoff], firstContactDone);
      assert.ok(!templates.includes(handoff));
      assert.ok(!hiddenTemplates.some((h) => h.template === handoff));
    }
  });

  it('does not count as a usable template: intro + handoff after first contact leaves none (the missing purpose is reopen)', () => {
    assert.equal(splitTemplatesByPurpose([intro, handoff], true).templates.length, 0);
  });

  it('is rejected by the gate when the planner names it', () => {
    const split = splitTemplatesByPurpose([intro, reopen, handoff], true);
    const ctx = { windowOpen: false, templates: split.templates, hiddenTemplates: split.hiddenTemplates } as unknown as DecisionContext;
    assert.throws(
      () => normalizeFollowUpMessage({ whatsapp_text: null, whatsapp_template: { template_id: 'HXhandoff', variables: ['א'] } }, ctx),
      /unknown whatsapp template HXhandoff/,
    );
  });
});
