import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFollowUpMessage,
  proposedMessageKind,
  type DecisionContext,
} from '../src/agents/declarationOfCapital/decisionSchema.js';
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

/** WhatsApp-only agent (declaration of capital): the form has no channel; the code supplies it. */
const waCtx = (over: Partial<DecisionContext> = {}): DecisionContext => ({
  windowOpen: false,
  templates: [template],
  ...over,
});

// openspec `planner-answer-schema`: a follow_up carries exactly one WhatsApp
// message — free-form text inside the 24h window, an approved template outside.
describe('one WhatsApp message per follow_up (normalizeFollowUpMessage)', () => {
  it('accepts a template message while the 24h window is closed', () => {
    const message = normalizeFollowUpMessage(
      { whatsapp_text: null, whatsapp_template: { template_id: 'HX123', variables: ['ישראל', 'כהן'] } },
      waCtx(),
    );
    assert.equal(message.channel, 'whatsapp');
    assert.equal(message.kind, 'template');
  });

  it('accepts free-form WhatsApp while the window is open', () => {
    const message = normalizeFollowUpMessage({ whatsapp_text: 'היי!', whatsapp_template: null }, waCtx({ windowOpen: true }));
    assert.deepEqual(message, { channel: 'whatsapp', kind: 'freeform', body: 'היי!' });
  });

  it('rejects free-form text while the window is closed', () => {
    assert.throws(
      () => normalizeFollowUpMessage({ whatsapp_text: 'היי!', whatsapp_template: null }, waCtx()),
      /outside the 24h window/,
    );
  });

  it('rejects an answer that fills both message fields, naming both', () => {
    assert.throws(
      () =>
        normalizeFollowUpMessage(
          { whatsapp_text: 'היי!', whatsapp_template: { template_id: 'HX123', variables: ['א', 'ב'] } },
          waCtx({ windowOpen: true }),
        ),
      /both whatsapp_text and whatsapp_template/,
    );
  });

  it('rejects an answer that fills neither message field', () => {
    assert.throws(
      () => normalizeFollowUpMessage({ whatsapp_text: null, whatsapp_template: null }, waCtx({ windowOpen: true })),
      /exactly one WhatsApp message/,
    );
    // Whitespace-only text counts as empty.
    assert.throws(
      () => normalizeFollowUpMessage({ whatsapp_text: '   ', whatsapp_template: null }, waCtx({ windowOpen: true })),
      /exactly one WhatsApp message/,
    );
  });

  it('rejects an unknown template and a wrong variable count', () => {
    assert.throws(
      () => normalizeFollowUpMessage({ whatsapp_text: null, whatsapp_template: { template_id: 'HX999', variables: [] } }, waCtx()),
      /unknown whatsapp template/,
    );
    assert.throws(
      () => normalizeFollowUpMessage({ whatsapp_text: null, whatsapp_template: { template_id: 'HX123', variables: ['א'] } }, waCtx()),
      /expects 2 variables/,
    );
  });
});

describe('proposedMessageKind (the validate_message observed value)', () => {
  it('reads the kind the way normalization does', () => {
    assert.equal(proposedMessageKind({ whatsapp_text: 'היי', whatsapp_template: null }), 'freeform');
    assert.equal(proposedMessageKind({ whatsapp_text: null, whatsapp_template: { template_id: 'HX123', variables: [] } }), 'template');
    assert.equal(proposedMessageKind({ whatsapp_text: null, whatsapp_template: null }), '—');
    assert.equal(proposedMessageKind({ whatsapp_text: ' ', whatsapp_template: null }), '—');
  });
});
