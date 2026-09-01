import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFollowUpMessage, type DecisionContext } from '../src/agents/docCollector/decisionSchema.js';
import type { WaTemplateRow } from '../src/db/types.js';

const template: WaTemplateRow = {
  id: 't1',
  content_sid: 'HX123',
  name: 'capital_intro',
  body: 'שלום {{1}}, כאן העוזר של משרד {{2}} לעניין הצהרת ההון.',
  variable_count: 2,
  agent_type: 'declaration_of_capital',
  created_at: new Date(),
};

/** WhatsApp-only agent (declaration of capital): email may never be chosen. */
const waOnlyCtx = (over: Partial<DecisionContext> = {}): DecisionContext => ({
  emailAllowed: false,
  whatsappAllowed: true,
  windowOpen: false,
  templates: [template],
  ...over,
});

describe('WhatsApp-only channel enforcement (normalizeFollowUpMessage)', () => {
  it('rejects an explicit email decision', () => {
    assert.throws(
      () =>
        normalizeFollowUpMessage(
          { channel: 'email', email_subject: 'נושא', email_body: 'גוף', whatsapp_text: null, whatsapp_template: null },
          waOnlyCtx(),
        ),
      /WhatsApp only/,
    );
  });

  it('rejects the null-channel (implicit email) fallback too', () => {
    assert.throws(
      () =>
        normalizeFollowUpMessage(
          { channel: null, email_subject: 'נושא', email_body: 'גוף', whatsapp_text: null, whatsapp_template: null },
          waOnlyCtx(),
        ),
      /WhatsApp only/,
    );
  });

  it('accepts a template message while the 24h window is closed', () => {
    const message = normalizeFollowUpMessage(
      {
        channel: 'whatsapp',
        email_subject: null,
        email_body: null,
        whatsapp_text: null,
        whatsapp_template: { template_id: 'HX123', variables: ['ישראל', 'כהן'] },
      },
      waOnlyCtx(),
    );
    assert.equal(message.channel, 'whatsapp');
    if (message.channel !== 'whatsapp') return;
    assert.equal(message.kind, 'template');
  });

  it('accepts free-form WhatsApp while the window is open', () => {
    const message = normalizeFollowUpMessage(
      { channel: 'whatsapp', email_subject: null, email_body: null, whatsapp_text: 'היי!', whatsapp_template: null },
      waOnlyCtx({ windowOpen: true }),
    );
    assert.deepEqual(message, { channel: 'whatsapp', kind: 'freeform', body: 'היי!' });
  });

  it('leaves email-capable agents untouched (emailAllowed undefined)', () => {
    const message = normalizeFollowUpMessage(
      { channel: null, email_subject: 'נושא', email_body: 'גוף', whatsapp_text: null, whatsapp_template: null },
      { whatsappAllowed: false, windowOpen: false, templates: [] },
    );
    assert.deepEqual(message, { channel: 'email', subject: 'נושא', body: 'גוף' });
  });
});
