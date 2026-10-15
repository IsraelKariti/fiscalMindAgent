import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFollowUpMessage,
  proposedMessageKind,
  type DecisionContext,
} from '../src/agents/declarationOfCapital/decisionSchema.js';
import type { WaTemplateRow } from '../src/db/types.js';
import { hiddenTemplateReason, splitTemplatesByPurpose } from '../src/agents/declarationOfCapital/templatePurpose.js';
import { buildWhatsAppSection } from '../src/agents/declarationOfCapital/prompt.js';

const template: WaTemplateRow = {
  id: 't1',
  content_sid: 'HX123',
  name: 'capital_intro',
  body: 'שלום {{1}}, כאן העוזר של משרד {{2}} לעניין הצהרת ההון.',
  variable_count: 2,
  agent_type: 'declaration_of_capital',
  purpose: 'intro',
  created_at: new Date(),
};

const reopen: WaTemplateRow = {
  ...template,
  id: 't2',
  content_sid: 'HX456',
  name: 'capital_update',
  body: 'שלום {{1}}, נשמח להמשיך. השב לי כאן שאתה מוכן, ונמשיך.',
  variable_count: 1,
  purpose: 'reopen',
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

// openspec `whatsapp-templates`: intro templates only before the first
// delivered message, reopen templates only after; the others are hidden.
describe('templates usable for the client (splitTemplatesByPurpose)', () => {
  it('offers only the intro before any message was delivered', () => {
    const { templates, hiddenTemplates } = splitTemplatesByPurpose([template, reopen], false);
    assert.deepEqual(templates.map((t) => t.name), ['capital_intro']);
    assert.deepEqual(hiddenTemplates.map((h) => h.template.name), ['capital_update']);
    assert.match(hiddenTemplates[0]!.reason, /first contact/);
  });

  it('offers only reopen templates once a message was delivered', () => {
    const { templates, hiddenTemplates } = splitTemplatesByPurpose([template, reopen], true);
    assert.deepEqual(templates.map((t) => t.name), ['capital_update']);
    assert.deepEqual(hiddenTemplates.map((h) => h.template.name), ['capital_intro']);
    assert.match(hiddenTemplates[0]!.reason, /already delivered/);
  });

  it('leaves nothing usable when only the intro exists and it was delivered', () => {
    const { templates, hiddenTemplates } = splitTemplatesByPurpose([template], true);
    assert.equal(templates.length, 0);
    assert.equal(hiddenTemplates.length, 1);
  });

  it('leaves nothing usable when only reopen templates exist before first contact', () => {
    const { templates } = splitTemplatesByPurpose([reopen], false);
    assert.equal(templates.length, 0);
  });

  it('rejects a hidden template with its reason (the business_rules note)', () => {
    const ctx = waCtx({ templates: [reopen], hiddenTemplates: [{ template, reason: hiddenTemplateReason(template) }] });
    assert.throws(
      () => normalizeFollowUpMessage({ whatsapp_text: null, whatsapp_template: { template_id: 'HX123', variables: ['א', 'ב'] } }, ctx),
      /capital_intro .*not usable for this client: intro template, already delivered/,
    );
    const ok = normalizeFollowUpMessage({ whatsapp_text: null, whatsapp_template: { template_id: 'HX456', variables: ['ישראל'] } }, ctx);
    assert.equal(ok.kind, 'template');
  });

  it('prints hidden templates in the prompt section with their reason', () => {
    const section = buildWhatsAppSection('tok', {
      allowed: true,
      unavailableReason: null,
      windowOpen: false,
      windowClosesAt: null,
      templates: [reopen],
      hiddenTemplates: [{ template, reason: hiddenTemplateReason(template) }],
    });
    assert.match(section, /\[template_id: HX456\] capital_update \(reopen\)/);
    assert.match(section, /not usable for this client \(do not send\):\n\[hidden\] capital_intro \(intro\) — intro template, already delivered/);
    assert.doesNotMatch(section, /\[template_id: HX123\]/);
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
