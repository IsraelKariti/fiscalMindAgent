import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleCalls,
  checklistUnits,
  describeCall,
  describeCalls,
  endingCorrectionNote,
  inExecutionOrder,
  isTerminalTool,
  parseTurnCalls,
  TERMINAL_TOOL_NAMES,
  toolJsonSchemas,
  toolParametersJsonSchema,
  toolsForContext,
  type ParsedToolCall,
  type ToolCall,
} from '../src/agents/declarationOfCapital/decisionTools.js';
import type { DecisionContext } from '../src/agents/declarationOfCapital/decisionSchema.js';

// openspec `planner-answer-tools`: the planner answers with flat tool calls in a
// loop. The shape test replaces the old nullable-place budget: Anthropic's
// compiler refused the deep form ("The compiled grammar is too large",
// 2026-10-14), so every tool stays flat — zero nullable, zero optional, no
// nested object. There is no conclude: the run ends on a terminal tool.

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
  documentFetch: [{ provider: 'israel_tax_authority', state: 'none', available: true, clientOnWhatsapp: true, documentKeys: ['form_106'] }],
};
const NO_INTAKE: DecisionContext = { windowOpen: true, templates: [] };

const sendText = (text = 'שלום', send_at = 'asap'): ToolCall => ({ name: 'send_whatsapp_text', args: { text, send_at, reasoning: 'test' } });
const noEvidence = { evidence_message_id: '', evidence_quote: '' };
const evidence = { evidence_message_id: 'msg-1', evidence_quote: 'יש לי דירה ברחוב הרצל' };

describe('tool shape (replaces the nullable-place budget)', () => {
  const nullable = (schema: Record<string, unknown>): boolean =>
    (Array.isArray(schema.anyOf) && schema.anyOf.some((b) => (b as { type?: unknown }).type === 'null')) ||
    (Array.isArray(schema.type) && schema.type.includes('null'));

  for (const [label, ctx] of Object.entries({ capital: CAPITAL, 'capital + fetch': CAPITAL_WITH_FETCH, 'no intake': NO_INTAKE })) {
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

  it('capital declaration without a fetch offer: every tool except document_fetch, no conclude', () => {
    assert.deepEqual(names(CAPITAL), [
      'send_whatsapp_text', 'send_whatsapp_template', 'goal_complete', 'client_declined', 'ask_team', 'mark_collected', 'tie_file',
      'set_required', 'add_instance', 'state_cost', 'state_vehicle', 'retire_document', 'set_company', 'attestation',
    ]);
    assert.ok(names(CAPITAL_WITH_FETCH).includes('document_fetch'));
    assert.ok(!(names(CAPITAL_WITH_FETCH) as string[]).includes('conclude'));
  });

  it('no intake: no checklist tools; the terminal tools, ask_team and the tie tools are always offered', () => {
    const n = names(NO_INTAKE);
    assert.deepEqual(n, ['send_whatsapp_text', 'send_whatsapp_template', 'goal_complete', 'client_declined', 'ask_team', 'mark_collected', 'tie_file']);
    for (const ctx of [CAPITAL, CAPITAL_WITH_FETCH, NO_INTAKE]) {
      const offered: string[] = names(ctx);
      for (const always of [...TERMINAL_TOOL_NAMES, 'ask_team', 'mark_collected', 'tie_file']) assert.ok(offered.includes(always), always);
    }
  });

  it('the terminal tools carry a reasoning parameter; the tool list is what the stages page documents', () => {
    const tools = toolJsonSchemas(CAPITAL);
    for (const name of TERMINAL_TOOL_NAMES) {
      const tool = tools.find((t) => t.name === name)!;
      assert.ok('reasoning' in (tool.parameters.properties as Record<string, unknown>), name);
      assert.ok(isTerminalTool(name));
    }
    assert.ok(!isTerminalTool('tie_file'));
  });
});

describe('parseTurnCalls (the tool_calls check, per call)', () => {
  const tools = toolsForContext(CAPITAL);

  it('accepts the good calls with their turn position and lists each fault with its reason', () => {
    const { accepted, faults } = parseTurnCalls(
      [{ name: 'conclude', args: { decision: 'follow_up', reasoning: 'r' } }, sendText(), { name: 'send_email', args: {} }, { name: 'tie_file', args: { file_id: 'f' } }],
      tools,
    );
    assert.deepEqual(accepted.map((c) => [c.name, c.index]), [['send_whatsapp_text', 1]]);
    assert.deepEqual(faults.map((f) => [f.index, f.tool]), [[0, null], [2, null], [3, 'tie_file']] as unknown[]);
    assert.match(faults[0]!.reason, /there is no conclude: the run ends on a terminal tool \(send_whatsapp_text, send_whatsapp_template, goal_complete, client_declined\)/);
    assert.match(faults[1]!.reason, /"send_email" is not offered/);
    assert.match(faults[2]!.reason, /"tie_file" at document_id/);
  });

  it('no calls is no fault: the loop handles a text-only turn', () => {
    assert.deepEqual(parseTurnCalls([], tools), { accepted: [], faults: [] });
  });

  it('a tool the context does not offer is a fault', () => {
    const { faults } = parseTurnCalls([{ name: 'document_fetch', args: { action: 'cancel', provider: 'x', document_keys: [] } }], tools);
    assert.match(faults[0]!.reason, /"document_fetch" is not offered/);
    assert.equal(parseTurnCalls([{ name: 'document_fetch', args: { action: 'cancel', provider: 'x', document_keys: [] } }], toolsForContext(CAPITAL_WITH_FETCH)).faults.length, 0);
  });
});

describe('execution order and units', () => {
  const parsed = (calls: ToolCall[]): ParsedToolCall[] => parseTurnCalls(calls, toolsForContext(CAPITAL_WITH_FETCH)).accepted;

  it('inExecutionOrder: checklist, attestation, ties, ask_team, document_fetch, terminal — stable within a group', () => {
    const calls = parsed([
      sendText(),
      { name: 'document_fetch', args: { action: 'client_agreed', provider: 'israel_tax_authority', document_keys: [] } },
      { name: 'ask_team', args: { question: 'q', why: '', evidence_message_id: '' } },
      { name: 'tie_file', args: { file_id: 'f', document_id: 'doc-bank', ...noEvidence } },
      { name: 'attestation', args: { action: 'confirmed', ...evidence } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-bank', name: 'x', description: '', already_provided: false, file_ids: [], paper_key: '', ...evidence, proven_by_file_id: '' } },
      { name: 'set_required', args: { document_id: 'doc-re', resolution: 'not_required', ...evidence, proven_by_file_id: '' } },
      { name: 'mark_collected', args: { document_id: 'doc-bank' } },
    ]);
    assert.deepEqual(inExecutionOrder(calls).map((c) => c.name), [
      'set_required', 'add_instance', 'attestation', 'tie_file', 'mark_collected', 'ask_team', 'document_fetch', 'send_whatsapp_text',
    ]);
  });

  it('checklistUnits: a required resolution takes the instances under it and their statements; other additions group per anchor; the rest stand alone', () => {
    const calls = parsed([
      { name: 'set_required', args: { document_id: 'doc-re', resolution: 'required', ...evidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-re', name: 'דירה', description: '', already_provided: false, file_ids: [], paper_key: 'cost_declaration', ...noEvidence, proven_by_file_id: '' } },
      { name: 'state_cost', args: { document_id: '', instance_name: 'דירה', amount: 1850000, currency: 'ILS', ...evidence } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-bank', name: 'בנק א', description: '', already_provided: false, file_ids: [], paper_key: '', ...evidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-bank', name: 'בנק ב', description: '', already_provided: false, file_ids: [], paper_key: '', ...noEvidence, proven_by_file_id: '' } },
      { name: 'state_cost', args: { document_id: 'doc-bank', instance_name: '', amount: 5, currency: 'ILS', ...evidence } },
      { name: 'state_cost', args: { document_id: '', instance_name: 'אין כזה', amount: 5, currency: 'ILS', ...evidence } },
      { name: 'attestation', args: { action: 'confirmed', ...evidence } },
      { name: 'set_required', args: { document_id: 'doc-re', resolution: 'not_required', ...evidence, proven_by_file_id: '' } },
    ]);
    const units = checklistUnits(calls).map((u) => u.map((c) => `${c.name}:${String(c.args.name || c.args.document_id || c.args.instance_name || c.args.action)}`));
    assert.deepEqual(units, [
      ['set_required:doc-re', 'add_instance:דירה', 'state_cost:דירה'],
      ['set_required:doc-re'], // the duplicate stands alone: assembly refuses it
      ['add_instance:בנק א', 'add_instance:בנק ב'],
      ['state_cost:doc-bank'],
      ['state_cost:אין כזה'], // names no instance of the turn: assembly refuses it by name
      ['attestation:confirmed'],
    ]);
    assert.throws(() => assembleCalls(calls.filter((c) => c.name === 'state_cost' && c.args.instance_name === 'אין כזה')), /no add_instance call of this turn has that name/);
  });
});

describe('assembleCalls (one unit into the raw form)', () => {
  const parsed = (calls: ToolCall[], ctx = CAPITAL) => assembleCalls(parseTurnCalls(calls, toolsForContext(ctx)).accepted);

  it('a tie, a collection and a resolution', () => {
    const raw = parsed([
      { name: 'tie_file', args: { file_id: 'file-1', document_id: 'doc-bank', ...noEvidence } },
      { name: 'mark_collected', args: { document_id: 'doc-bank' } },
      { name: 'set_required', args: { document_id: 'doc-vehicle', resolution: 'not_required', evidence_message_id: 'msg-1', evidence_quote: 'אין לי רכב', proven_by_file_id: '' } },
    ]);
    // '' / '' evidence reads as "no evidence given", as the form's null did.
    assert.deepEqual(raw.matched_files, [{ file_id: 'file-1', document_id: 'doc-bank', evidence: null }]);
    assert.deepEqual(raw.collected_document_ids, ['doc-bank']);
    assert.deepEqual(raw.resolved_documents, [
      { document_id: 'doc-vehicle', resolution: 'not_required', instances: null, evidence: { message_id: 'msg-1', quote: 'אין לי רכב' }, proven_by_file_id: '' },
    ]);
    assert.equal(raw.attestation, null);
    assert.deepEqual(raw.stated_costs, []);
  });

  it("instances under a row resolved in the same turn become that resolution's instances; others become one addition per anchor", () => {
    const raw = parsed([
      { name: 'set_required', args: { document_id: 'doc-vehicle', resolution: 'required', ...evidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-vehicle', name: 'רישיון רכב - מאזדה', description: '', already_provided: false, file_ids: [], paper_key: 'vehicle_license', ...noEvidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-vehicle', name: 'מסמך רכישה - מאזדה', description: 'קבלה', already_provided: false, file_ids: [], paper_key: 'vehicle_purchase_document', ...noEvidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-bank', name: 'אישור יתרות בנק הפועלים', description: '', already_provided: false, file_ids: ['file-9'], paper_key: '', ...evidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-bank', name: 'אישור יתרות בנק דיסקונט', description: '', already_provided: true, file_ids: [], paper_key: '', ...noEvidence, proven_by_file_id: '' } },
    ]);
    const [resolution] = raw.resolved_documents!;
    assert.equal(resolution!.resolution, 'required');
    assert.deepEqual(resolution!.instances!.map((i) => [i.name, i.description, i.paper_key]), [
      ['רישיון רכב - מאזדה', null, 'vehicle_license'],
      ['מסמך רכישה - מאזדה', 'קבלה', 'vehicle_purchase_document'],
    ]);
    assert.equal(raw.added_instances!.length, 1);
    const [addition] = raw.added_instances!;
    assert.equal(addition!.anchor_document_id, 'doc-bank');
    assert.equal(addition!.instances.length, 2);
    assert.deepEqual(addition!.evidence, { message_id: 'msg-1', quote: 'יש לי דירה ברחוב הרצל' });
    assert.deepEqual(addition!.instances[0]!.file_ids, ['file-9']);
    assert.equal(addition!.instances[1]!.already_provided, true);
  });

  it('cost of a new item in the same turn rides on that instance; a cost for an existing item goes to stated_costs', () => {
    const raw = parsed([
      { name: 'set_required', args: { document_id: 'doc-re', resolution: 'required', ...evidence, proven_by_file_id: '' } },
      { name: 'add_instance', args: { anchor_document_id: 'doc-re', name: 'הצהרת עלות - דירה ברחוב הרצל', description: '', already_provided: false, file_ids: [], paper_key: 'cost_declaration', ...noEvidence, proven_by_file_id: '' } },
      { name: 'state_cost', args: { document_id: '', instance_name: 'הצהרת עלות - דירה ברחוב הרצל', amount: 1850000, currency: 'ILS', evidence_message_id: 'msg-1', evidence_quote: 'קניתי אותה ב-1,850,000' } },
      { name: 'state_cost', args: { document_id: 'doc-bank', instance_name: '', amount: 85000, currency: 'ILS', evidence_message_id: 'msg-1', evidence_quote: '85,000' } },
    ]);
    const instance = raw.resolved_documents![0]!.instances![0]!;
    assert.deepEqual(instance.stated_cost, { amount: 1850000, currency: 'ILS', message_id: 'msg-1', quote: 'קניתי אותה ב-1,850,000' });
    assert.deepEqual(raw.stated_costs, [{ document_id: 'doc-bank', amount: 85000, currency: 'ILS', evidence: { message_id: 'msg-1', quote: '85,000' } }]);
  });

  it('refuses the within-unit faults with a named note', () => {
    assert.throws(() => parsed([{ name: 'attestation', args: { action: 'request', ...noEvidence } }, { name: 'attestation', args: { action: 'request', ...noEvidence } }]), /attestation must be called at most once/);
    assert.throws(() => parsed([{ name: 'state_cost', args: { document_id: '', instance_name: '', amount: 1, currency: 'ILS', ...noEvidence } }]), /exactly one target/);
    assert.throws(() => parsed([{ name: 'state_cost', args: { document_id: 'doc-bank', instance_name: 'x', amount: 1, currency: 'ILS', ...noEvidence } }]), /exactly one target/);
    assert.throws(
      () => parsed([{ name: 'state_cost', args: { document_id: '', instance_name: 'דירה אחרת', amount: 1, currency: 'ILS', ...noEvidence } }]),
      /names instance "דירה אחרת" but no add_instance call of this turn.*document id an earlier turn's add_instance result returned/,
    );
    assert.throws(
      () => parsed([{ name: 'set_required', args: { document_id: 'doc-re', resolution: 'not_required', ...evidence, proven_by_file_id: '' } }, { name: 'set_required', args: { document_id: 'doc-re', resolution: 'required', ...evidence, proven_by_file_id: '' } }]),
      /called twice for document doc-re/,
    );
  });

  it('attestation, document_fetch and ask_team map onto the form fields', () => {
    const raw = parsed(
      [
        { name: 'attestation', args: { action: 'confirmed', evidence_message_id: 'msg-1', evidence_quote: 'מאשר' } },
        { name: 'document_fetch', args: { action: 'client_agreed', provider: 'israel_tax_authority', document_keys: [] } },
        { name: 'ask_team', args: { question: 'ש', why: 'כי', evidence_message_id: 'msg-1' } },
      ],
      CAPITAL_WITH_FETCH,
    );
    assert.equal(raw.attestation, 'confirmed');
    assert.deepEqual(raw.attestation_evidence, { message_id: 'msg-1', quote: 'מאשר' });
    assert.equal(raw.document_fetch_action, 'client_agreed');
    assert.equal(raw.document_fetch_provider, 'israel_tax_authority');
    assert.equal(raw.document_fetch_document_keys, null, '[] means all pending documents');
    assert.deepEqual(raw.team_question, { question: 'ש', why: 'כי', evidence_message_id: 'msg-1' });
    const request = parsed([{ name: 'attestation', args: { action: 'request', ...noEvidence } }]);
    assert.equal(request.attestation, 'request');
    assert.equal(request.attestation_evidence, null);
  });
});

describe('gate row text', () => {
  it('describeCalls counts and names the calls; describeCall shows the key parameters with names beside ids', () => {
    assert.equal(describeCalls([]), '0 calls');
    assert.equal(describeCalls([sendText(), { name: 'tie_file', args: {} }]), '2 calls: send_whatsapp_text, tie_file');
    const [call] = parseTurnCalls([{ name: 'tie_file', args: { file_id: 'f1', document_id: 'doc-bank', ...noEvidence } }], toolsForContext(CAPITAL)).accepted;
    assert.equal(describeCall(call!, (id) => (id === 'doc-bank' ? 'אישור יתרות' : undefined)), 'tie_file — document_id: doc-bank (אישור יתרות), file_id: f1');
    const [send] = parseTurnCalls([sendText('שלום לך', '2030-01-01 10:00')], toolsForContext(CAPITAL)).accepted;
    assert.equal(describeCall(send!, () => undefined), 'send_whatsapp_text — send_at: 2030-01-01 10:00, text: 7 chars');
  });

  it('the corrective note states the ending rule and nothing else', () => {
    const note = endingCorrectionNote();
    assert.ok(note.includes('no tool call'));
    assert.ok(note.includes('NOT sent to the client'));
    for (const name of TERMINAL_TOOL_NAMES) assert.ok(note.includes(name), name);
    assert.ok(note.includes('"No message needed" is never a valid state'));
    assert.ok(!note.includes('conclude') && !note.includes('"collect"'));
  });
});
