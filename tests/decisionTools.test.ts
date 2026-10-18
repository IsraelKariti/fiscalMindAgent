import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleDecision,
  correctionSuffix,
  describeCalls,
  gateDecision,
  parseToolCalls,
  toolJsonSchemas,
  toolParametersJsonSchema,
  toolsForContext,
  type ToolCall,
} from '../src/agents/declarationOfCapital/decisionTools.js';
import { DecisionRejectedError, type DecisionContext } from '../src/agents/declarationOfCapital/decisionSchema.js';

// openspec `planner-answer-tools`: the planner answers with flat tool calls.
// The shape test replaces the old nullable-place budget: Anthropic's compiler
// refused the deep form ("The compiled grammar is too large", 2026-10-14), so
// every tool stays flat — zero nullable, zero optional, no nested object.

const intake = {
  resolvable: [
    { id: 'doc-re', status: 'unresolved' as const, typeKey: 'real_estate', multiInstance: true },
    { id: 'doc-vehicle', status: 'unresolved' as const, typeKey: 'vehicle', multiInstance: true },
  ],
  typedRows: [{ id: 'doc-bank', status: 'pending', typeKey: 'bank_balance', multiInstance: true }],
  inboundTexts: new Map([['msg-1', 'יש לי דירה ברחוב הרצל, קניתי אותה ב-1,850,000']]),
  allSettled: false,
  attestationRequested: false,
  confirmableMessageIds: new Set<string>(),
  attestationConfirmed: false,
};
const CAPITAL: DecisionContext = { windowOpen: true, templates: [], intake };
const CAPITAL_WITH_FETCH: DecisionContext = {
  ...CAPITAL,
  taxFetch: [{ provider: 'israel_tax_authority', state: 'none', available: true, clientOnWhatsapp: true, documentKeys: ['form_106'] }],
};
const AFTER_VERIFICATION: DecisionContext = { ...CAPITAL, afterVerification: true };
const NO_INTAKE: DecisionContext = { windowOpen: true, templates: [] };

const conclude = (decision: string, reasoning = 'test'): ToolCall => ({ name: 'conclude', args: { decision, reasoning } });
const sendText = (text = 'שלום', send_at = 'asap'): ToolCall => ({ name: 'send_whatsapp_text', args: { text, send_at } });
const noEvidence = { evidence_message_id: '', evidence_quote: '' };
const evidence = { evidence_message_id: 'msg-1', evidence_quote: 'יש לי דירה ברחוב הרצל' };

describe('tool shape (replaces the nullable-place budget)', () => {
  const nullable = (schema: Record<string, unknown>): boolean =>
    (Array.isArray(schema.anyOf) && schema.anyOf.some((b) => (b as { type?: unknown }).type === 'null')) ||
    (Array.isArray(schema.type) && schema.type.includes('null'));

  for (const [label, ctx] of Object.entries({ capital: CAPITAL, 'capital + fetch': CAPITAL_WITH_FETCH, 'after verification': AFTER_VERIFICATION, 'no intake': NO_INTAKE })) {
    it(`${label}: every tool is flat — all parameters required, none nullable, no object or list of objects`, () => {
      const tools = toolsForContext(ctx);
      assert.ok(tools.length <= 20, `${tools.length} tools`);
      for (const tool of tools) {
        const json = toolParametersJsonSchema(tool);
        assert.equal(json.type, 'object', tool.name);
        assert.equal(json.additionalProperties, false, tool.name);
        const props = json.properties as Record<string, Record<string, unknown>>;
        const required = new Set((json.required as string[] | undefined) ?? []);
        for (const [name, prop] of Object.entries(props)) {
          const where = `${tool.name}.${name}`;
          assert.ok(required.has(name), `${where} is optional`);
          assert.ok(!nullable(prop), `${where} admits null`);
          assert.notEqual(prop.type, 'object', `${where} is an object`);
          assert.ok(!('anyOf' in prop), `${where} is a union`);
          if (prop.type === 'array') assert.notEqual((prop.items as { type?: unknown } | undefined)?.type, 'object', `${where} is a list of objects`);
        }
      }
    });
  }

  it('a nested parameter would fail the shape test', () => {
    const [tool] = toolsForContext(CAPITAL);
    const json = toolParametersJsonSchema(tool!);
    const props = json.properties as Record<string, Record<string, unknown>>;
    const nested = { ...props, extra: { type: 'object', properties: { a: { type: 'string' } } } };
    assert.ok(Object.values(nested).some((p) => p.type === 'object'));
  });
});

describe('toolsForContext', () => {
  const names = (ctx: DecisionContext) => toolsForContext(ctx).map((t) => t.name);
  const decisionValues = (ctx: DecisionContext) =>
    ((toolJsonSchemas(ctx)[0]!.parameters.properties as Record<string, { enum?: unknown }>).decision!.enum as string[]);

  it('capital declaration without a fetch offer: every tool except tax_fetch', () => {
    assert.deepEqual(names(CAPITAL), [
      'conclude', 'send_whatsapp_text', 'send_whatsapp_template', 'mark_collected', 'tie_file',
      'resolve_document', 'add_instance', 'state_cost', 'state_vehicle', 'retire_document', 'attestation',
    ]);
    assert.ok(names(CAPITAL_WITH_FETCH).includes('tax_fetch'));
    assert.deepEqual(decisionValues(CAPITAL), ['goal_complete', 'follow_up', 'collect']);
  });

  it('after verification: no collecting tools and no collect value', () => {
    const n = names(AFTER_VERIFICATION);
    assert.ok(!n.includes('mark_collected') && !n.includes('tie_file'));
    assert.deepEqual(decisionValues(AFTER_VERIFICATION), ['goal_complete', 'follow_up']);
  });

  it('no intake: no checklist tools; the message tools are always offered', () => {
    const n = names(NO_INTAKE);
    assert.deepEqual(n, ['conclude', 'send_whatsapp_text', 'send_whatsapp_template', 'mark_collected', 'tie_file']);
    for (const ctx of [CAPITAL, AFTER_VERIFICATION, NO_INTAKE]) {
      const offered: string[] = names(ctx);
      for (const always of ['conclude', 'send_whatsapp_text', 'send_whatsapp_template']) assert.ok(offered.includes(always));
    }
  });
});

describe('parseToolCalls (the tool_calls check)', () => {
  const tools = toolsForContext(CAPITAL);

  it('rejects no calls, an unknown tool, bad arguments, and a missing or doubled conclude', () => {
    assert.throws(() => parseToolCalls([], tools), /one or more tool calls/);
    assert.throws(() => parseToolCalls([conclude('follow_up'), { name: 'send_email', args: {} }], tools), /"send_email" is not offered/);
    assert.throws(() => parseToolCalls([{ name: 'conclude', args: { decision: 'follow_up' } }], tools), /"conclude" at reasoning/);
    assert.throws(() => parseToolCalls([sendText()], tools), /exactly once per answer \(got 0\)/);
    assert.throws(() => parseToolCalls([conclude('follow_up'), conclude('follow_up')], tools), /exactly once per answer \(got 2\)/);
  });

  it('rejects a tool the cycle does not offer', () => {
    const after = toolsForContext(AFTER_VERIFICATION);
    assert.throws(() => parseToolCalls([conclude('follow_up'), { name: 'tie_file', args: { file_id: 'f', document_id: 'd', ...noEvidence } }], after), /"tie_file" is not offered/);
    assert.throws(() => parseToolCalls([conclude('collect')], after), /"conclude" at decision/);
  });
});

describe('assembleDecision', () => {
  const parsed = (calls: ToolCall[], ctx = CAPITAL) => assembleDecision(parseToolCalls(calls, toolsForContext(ctx)));

  it('a follow_up with one text message', () => {
    const raw = parsed([conclude('follow_up', 'ask'), sendText('שלום', 'asap')]);
    assert.equal(raw.decision, 'follow_up');
    assert.equal(raw.reasoning, 'ask');
    assert.equal(raw.whatsapp_text, 'שלום');
    assert.equal(raw.whatsapp_template, null);
    assert.equal(raw.send_at, 'asap');
    assert.deepEqual(raw.collected_document_ids, []);
    assert.equal(raw.resolved_documents, null);
    assert.equal(raw.attestation, null);
    assert.deepEqual(raw.stated_costs, []);
  });

  it('a collecting answer: tie_file, mark_collected and a resolution in one turn', () => {
    const raw = parsed([
      conclude('collect'),
      { name: 'tie_file', args: { file_id: 'file-1', document_id: 'doc-bank', ...noEvidence } },
      { name: 'mark_collected', args: { document_id: 'doc-bank' } },
      { name: 'resolve_document', args: { document_id: 'doc-vehicle', resolution: 'not_required', evidence_message_id: 'msg-1', evidence_quote: 'אין לי רכב' } },
    ]);
    assert.equal(raw.decision, 'collect');
    // '' / '' evidence reads as "no evidence given", as the form's null did.
    assert.deepEqual(raw.matched_files, [{ file_id: 'file-1', document_id: 'doc-bank', evidence: null }]);
    assert.deepEqual(raw.collected_document_ids, ['doc-bank']);
    assert.deepEqual(raw.resolved_documents, [
      { document_id: 'doc-vehicle', resolution: 'not_required', instances: null, evidence: { message_id: 'msg-1', quote: 'אין לי רכב' } },
    ]);
    assert.equal(raw.whatsapp_text, null);
    assert.equal(raw.send_at, null);
  });

  it('instances under a row resolved in the same answer become that resolution\'s instances; others become one addition per anchor', () => {
    const raw = parsed([
      conclude('follow_up'),
      sendText(),
      { name: 'resolve_document', args: { document_id: 'doc-vehicle', resolution: 'required', ...evidence } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-vehicle', name: 'רישיון רכב - מאזדה', description: '', already_provided: false, file_ids: [], paper_key: 'vehicle_license', ...noEvidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-vehicle', name: 'מסמך רכישה - מאזדה', description: 'קבלה', already_provided: false, file_ids: [], paper_key: 'vehicle_purchase_document', ...noEvidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-bank', name: 'אישור יתרות בנק הפועלים', description: '', already_provided: false, file_ids: ['file-9'], paper_key: '', ...evidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-bank', name: 'אישור יתרות בנק דיסקונט', description: '', already_provided: true, file_ids: [], paper_key: '', ...noEvidence, proven_by_file_id: '' } },
    ]);
    const [resolution] = raw.resolved_documents!;
    assert.equal(resolution!.resolution, 'required');
    assert.equal(resolution!.instances!.length, 2);
    assert.deepEqual(resolution!.instances!.map((i) => [i.name, i.description, i.paper_key]), [
      ['רישיון רכב - מאזדה', null, 'vehicle_license'],
      ['מסמך רכישה - מאזדה', 'קבלה', 'vehicle_purchase_document'],
    ]);
    // Two instances on the same already-resolved row merge into one entry (the validator rejects two entries per anchor).
    assert.equal(raw.added_instances!.length, 1);
    const [addition] = raw.added_instances!;
    assert.equal(addition!.anchor_document_id, 'doc-bank');
    assert.equal(addition!.instances.length, 2);
    assert.deepEqual(addition!.evidence, { message_id: 'msg-1', quote: 'יש לי דירה ברחוב הרצל' });
    assert.deepEqual(addition!.instances[0]!.file_ids, ['file-9']);
    assert.equal(addition!.instances[1]!.already_provided, true);
  });

  it('cost of a new item in the same answer rides on that instance; a cost for an existing item goes to stated_costs', () => {
    const raw = parsed([
      conclude('follow_up'),
      sendText(),
      { name: 'resolve_document', args: { document_id: 'doc-re', resolution: 'required', ...evidence } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-re', name: 'הצהרת עלות - דירה ברחוב הרצל', description: '', already_provided: false, file_ids: [], paper_key: 'cost_declaration', ...noEvidence, proven_by_file_id: '' } },
      { name: 'state_cost', args: { document_id: '', instance_name: 'הצהרת עלות - דירה ברחוב הרצל', amount: 1850000, currency: 'ILS', evidence_message_id: 'msg-1', evidence_quote: 'קניתי אותה ב-1,850,000' } },
      { name: 'state_cost', args: { document_id: 'doc-bank', instance_name: '', amount: 85000, currency: 'ILS', evidence_message_id: 'msg-1', evidence_quote: '85,000' } },
    ]);
    const instance = raw.resolved_documents![0]!.instances![0]!;
    assert.deepEqual(instance.stated_cost, { amount: 1850000, currency: 'ILS', message_id: 'msg-1', quote: 'קניתי אותה ב-1,850,000' });
    assert.deepEqual(raw.stated_costs, [{ document_id: 'doc-bank', amount: 85000, currency: 'ILS', evidence: { message_id: 'msg-1', quote: '85,000' } }]);
  });

  it('rejects the call-count faults with a named note', () => {
    assert.throws(() => parsed([conclude('follow_up'), sendText(), { name: 'send_whatsapp_template', args: { template_id: 'HX1', variables: [], send_at: 'asap' } }]), /1 send_whatsapp_text and 1 send_whatsapp_template/);
    assert.throws(() => parsed([conclude('follow_up')]), /a follow_up needs exactly one WhatsApp message/);
    assert.throws(() => parsed([conclude('follow_up'), sendText(), { name: 'attestation', args: { action: 'request', ...noEvidence } }, { name: 'attestation', args: { action: 'request', ...noEvidence } }]), /attestation must be called at most once/);
    assert.throws(() => parsed([conclude('follow_up'), sendText(), { name: 'state_cost', args: { document_id: '', instance_name: '', amount: 1, currency: 'ILS', ...noEvidence } }]), /exactly one target/);
    assert.throws(() => parsed([conclude('follow_up'), sendText(), { name: 'state_cost', args: { document_id: 'doc-bank', instance_name: 'x', amount: 1, currency: 'ILS', ...noEvidence } }]), /exactly one target/);
    assert.throws(
      () => parsed([conclude('follow_up'), sendText(), { name: 'state_cost', args: { document_id: '', instance_name: 'דירה אחרת', amount: 1, currency: 'ILS', ...noEvidence } }]),
      /names instance "דירה אחרת" but no add_instance call/,
    );
    assert.throws(
      () => parsed([conclude('follow_up'), sendText(), { name: 'resolve_document', args: { document_id: 'doc-re', resolution: 'not_required', ...evidence } }, { name: 'resolve_document', args: { document_id: 'doc-re', resolution: 'required', ...evidence } }]),
      /called twice for document doc-re/,
    );
  });

  it('attestation and tax_fetch map onto the form fields', () => {
    const raw = parsed(
      [
        conclude('follow_up'),
        sendText(),
        { name: 'attestation', args: { action: 'confirmed', evidence_message_id: 'msg-1', evidence_quote: 'מאשר' } },
        { name: 'tax_fetch', args: { action: 'client_agreed', provider: 'israel_tax_authority', document_keys: [] } },
      ],
      CAPITAL_WITH_FETCH,
    );
    assert.equal(raw.attestation, 'confirmed');
    assert.deepEqual(raw.attestation_evidence, { message_id: 'msg-1', quote: 'מאשר' });
    assert.equal(raw.tax_fetch_action, 'client_agreed');
    assert.equal(raw.tax_fetch_provider, 'israel_tax_authority');
    assert.equal(raw.tax_fetch_document_keys, null, '[] means all pending documents');
    const request = parsed([conclude('follow_up'), sendText(), { name: 'attestation', args: { action: 'request', ...noEvidence } }]);
    assert.equal(request.attestation, 'request');
    assert.equal(request.attestation_evidence, null);
  });
});

describe('gateDecision (validate_message on tool calls)', () => {
  it('a valid answer lists tool_calls then business_rules, with the calls as observed', () => {
    const calls = [conclude('follow_up'), sendText('שלום', '2030-01-01 10:00')];
    const { decision, checks } = gateDecision(calls, CAPITAL);
    assert.equal(decision.decision, 'follow_up');
    assert.deepEqual(checks, [
      { key: 'tool_calls', passed: true, note: null, observed: '2 calls: conclude, send_whatsapp_text', expected: null },
      { key: 'business_rules', passed: true, note: null, observed: 'follow_up / freeform', expected: null },
    ]);
  });

  it('a shape fault fails tool_calls alone; business_rules never ran', () => {
    for (const calls of [[], [conclude('follow_up'), conclude('follow_up')], [conclude('follow_up'), { name: 'send_email', args: {} }]]) {
      assert.throws(
        () => gateDecision(calls, CAPITAL),
        (err: unknown) => {
          assert.ok(err instanceof DecisionRejectedError);
          assert.equal(err.checks.length, 1);
          assert.equal(err.checks[0]!.key, 'tool_calls');
          assert.equal(err.checks[0]!.passed, false);
          assert.equal(err.checks[0]!.observed, describeCalls(calls));
          return true;
        },
      );
    }
  });

  it('a rule fault passes tool_calls and fails business_rules with the note', () => {
    assert.throws(
      () => gateDecision([conclude('follow_up'), sendText(), { name: 'send_whatsapp_template', args: { template_id: 'HX1', variables: [], send_at: 'asap' } }], CAPITAL),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.deepEqual(err.checks.map((c) => [c.key, c.passed]), [['tool_calls', true], ['business_rules', false]]);
        assert.match(err.checks[1]!.note ?? '', /send_whatsapp_text and 1 send_whatsapp_template/);
        assert.equal(err.checks[1]!.observed, 'follow_up / freeform');
        return true;
      },
    );
    assert.throws(
      () => gateDecision([conclude('follow_up'), sendText('שלום', 'asap')], { ...CAPITAL, windowOpen: false }),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.deepEqual(err.checks.map((c) => [c.key, c.passed]), [['tool_calls', true], ['business_rules', false]]);
        assert.match(err.checks[1]!.note ?? '', /outside the 24h window/);
        return true;
      },
    );
  });
});

describe('correctionSuffix', () => {
  it('quotes the rejected calls, the note and the tool rules', () => {
    const calls = [conclude('follow_up')];
    const suffix = correctionSuffix(calls, new Error('a follow_up needs exactly one WhatsApp message'));
    assert.ok(suffix.includes(JSON.stringify(calls)));
    assert.ok(suffix.includes('a follow_up needs exactly one WhatsApp message'));
    assert.ok(suffix.includes('Call conclude exactly once'));
    assert.ok(suffix.includes('"collect"') && suffix.includes('"follow_up"') && suffix.includes('"goal_complete"'));
    assert.ok(suffix.includes('send_whatsapp_text'));
  });
});
