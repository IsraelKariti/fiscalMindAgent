import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { judgeRun } from '../src/agents/declarationOfCapital/decisionJudge.js';
import type { DecisionContext, IntakeDecisionState } from '../src/agents/declarationOfCapital/decisionSchema.js';
import type { ToolCall } from '../src/agents/declarationOfCapital/decisionTools.js';
import { gate, normalizeAnswer } from './helpers/judge.js';

// openspec `planner-answer-tools` (change planner-agentic-loop): each call is
// judged on its own; a refused call is answered with the refusal and the run
// goes on; a run ends with exactly one accepted terminal call. These tests
// drive the pure judge (decisionJudge.ts) the way plan.ts and the evals do.

const intake: IntakeDecisionState = {
  resolvable: [{ id: 'doc-vehicle', status: 'unresolved', typeKey: 'vehicle', multiInstance: true }],
  typedRows: [
    { id: 'doc-bank', name: 'אישור יתרות — לאומי', status: 'pending', typeKey: 'bank_balance', multiInstance: true },
    { id: 'doc-car-cost', status: 'pending', typeKey: 'real_estate', multiInstance: true, paperKey: 'cost_declaration' },
  ],
  inboundTexts: new Map([['msg-1', 'אין לי רכב. שילמתי 85,000 על הדירה']]),
  allSettled: false,
  attestationRequested: false,
  confirmableMessageIds: new Set(),
  attestationConfirmed: false,
};
const ctx: DecisionContext = { windowOpen: true, templates: [], intake };
const noEvidence = { evidence_message_id: '', evidence_quote: '' };
const quote = { evidence_message_id: 'msg-1', evidence_quote: 'אין לי רכב' };
const tie = (file_id = 'file-1', document_id = 'doc-bank'): ToolCall => ({ name: 'tie_file', args: { file_id, document_id, ...noEvidence } });
const mark = (document_id = 'doc-bank'): ToolCall => ({ name: 'mark_collected', args: { document_id } });
const text = (send_at = 'asap', body = 'תודה, קיבלתי'): ToolCall => ({ name: 'send_whatsapp_text', args: { text: body, send_at, reasoning: 'r' } });
const template: ToolCall = { name: 'send_whatsapp_template', args: { template_id: 'HX1', variables: [], send_at: 'asap', reasoning: 'r' } };
const resolveNot: ToolCall = { name: 'set_required', args: { document_id: 'doc-vehicle', resolution: 'not_required', ...quote, proven_by_file_id: '' } };
const decline: ToolCall = { name: 'client_declined', args: { reasoning: 'refused in words' } };
const goal: ToolCall = { name: 'goal_complete', args: { reasoning: 'all in' } };

describe('a tie and the message in one run', () => {
  it('a tie, a collection and a resolution are accepted, and the message ends the run', () => {
    const run = judgeRun([tie(), mark(), resolveNot, text()], ctx);
    assert.deepEqual(run.refusals, []);
    assert.deepEqual(run.changes.matched_files, [{ file_id: 'file-1', document_id: 'doc-bank', evidence: null }]);
    assert.deepEqual(run.changes.collected_document_ids, ['doc-bank']);
    assert.equal(run.changes.resolutions.length, 1);
    assert.equal(run.ending, 'message');
    assert.deepEqual(run.message?.message, { channel: 'whatsapp', kind: 'freeform', body: 'תודה, קיבלתי' });
    assert.equal(run.message?.sendAt, 'asap');
    assert.equal(run.reasoning, 'r');
  });

  it('a tie alone is a run without an ending yet (the message comes in a later turn)', () => {
    const run = judgeRun([tie(), mark()], ctx);
    assert.deepEqual(run.refusals, []);
    assert.equal(run.ending, 'none');
    assert.equal(normalizeAnswer({ collected_document_ids: ['doc-bank'], matched_files: [{ file_id: 'file-1', document_id: 'doc-bank', evidence: null }], document_fetch_action: null, document_fetch_provider: null, document_fetch_document_keys: null, resolved_documents: null, added_instances: null, retired_documents: null, stated_costs: [], stated_vehicles: [], attestation: null, attestation_evidence: null }, ctx).decision, 'none');
  });

  it('a stated cost ties no file and the run ends with its message', () => {
    const cost: ToolCall = { name: 'state_cost', args: { document_id: 'doc-car-cost', instance_name: '', amount: 85000, currency: 'ILS', evidence_message_id: 'msg-1', evidence_quote: 'שילמתי 85,000' } };
    const run = judgeRun([cost, text('2030-01-01 10:00')], ctx);
    assert.deepEqual(run.refusals, []);
    assert.equal(run.changes.statedCosts.length, 1);
    assert.equal(run.ending, 'message');
    assert.equal(run.message?.sendAt, '2030-01-01 10:00');
  });
});

describe('a refused call is answered and the run goes on', () => {
  it('free text outside the window is refused; a template in the same run ends it', () => {
    const closed: DecisionContext = { ...ctx, windowOpen: false, templates: [{ content_sid: 'HX1', name: 'reopen', body: 'שלום', variable_count: 0 } as never] };
    const run = judgeRun([text(), template], closed);
    assert.equal(run.refusals.length, 1);
    assert.match(run.refusals[0]!.reason, /outside the 24h window/);
    assert.equal(run.ending, 'message');
    assert.equal(run.message?.message.kind, 'template');
  });

  it('a second message in the same run is refused: one ending per run', () => {
    const run = judgeRun([text(), text('asap', 'שוב')], ctx);
    assert.equal(run.ending, 'message');
    assert.equal(run.refusals.length, 1);
    assert.match(run.refusals[0]!.reason, /already ended with send_whatsapp_text — one ending per run/);
  });

  it('a bad send_at is refused with the two accepted forms named', () => {
    const run = judgeRun([text('soon')], ctx);
    assert.equal(run.ending, 'none');
    assert.match(run.refusals[0]!.reason, /send_at "soon" is not valid — give "YYYY-MM-DD HH:MM".*or "asap"/);
  });

  it('a resolution without evidence is refused while the tie and the message of the same turn are accepted', () => {
    const run = judgeRun([{ name: 'set_required', args: { document_id: 'doc-vehicle', resolution: 'not_required', ...noEvidence, proven_by_file_id: '' } }, tie(), text()], ctx);
    assert.equal(run.refusals.length, 1);
    assert.match(run.refusals[0]!.reason, /requires evidence/);
    assert.equal(run.changes.resolutions.length, 0);
    assert.equal(run.changes.matched_files.length, 1);
    assert.equal(run.ending, 'message');
  });

  it('a conclude call fails the shape check with a hint about the terminal tools, and the rest of the turn runs', () => {
    const run = judgeRun([{ name: 'conclude', args: { decision: 'follow_up', reasoning: 'r' } }, text()], ctx);
    assert.equal(run.refusals.length, 1);
    assert.match(run.refusals[0]!.reason, /there is no conclude/);
    assert.equal(run.ending, 'message');
  });
});

describe('goal_complete', () => {
  it('refused while rows are unsettled, refused while the attestation is not confirmed, accepted when both hold', () => {
    assert.match(judgeRun([goal], ctx).refusals[0]!.reason, /documents are still unsettled/);
    const settled: DecisionContext = { ...ctx, intake: { ...intake, allSettled: true } };
    assert.match(judgeRun([goal], settled).refusals[0]!.reason, /the attestation is not confirmed/);
    const done = judgeRun([goal], { ...ctx, intake: { ...intake, allSettled: true, attestationConfirmed: true } });
    assert.deepEqual(done.refusals, []);
    assert.equal(done.ending, 'goal_complete');
    assert.equal(done.reasoning, 'all in');
    // A client with no configured documents trusts the call (legacy behavior).
    assert.equal(judgeRun([goal], ctx, { hasDocuments: false, allSettled: false, attestationConfirmed: false }).ending, 'goal_complete');
  });

  it('a message after an accepted goal_complete is refused', () => {
    const run = judgeRun([goal, text()], { ...ctx, intake: { ...intake, allSettled: true, attestationConfirmed: true } });
    assert.equal(run.ending, 'goal_complete');
    assert.match(run.refusals[0]!.reason, /already ended with goal_complete/);
  });
});

describe('client_declined (openspec client-decline)', () => {
  it('alone it ends the run', () => {
    const run = judgeRun([decline], ctx);
    assert.deepEqual(run.refusals, []);
    assert.equal(run.ending, 'client_declined');
    assert.equal(run.reasoning, 'refused in words');
  });

  it('refused after a tie, a checklist change, a team question or a fetch step in the same run', () => {
    assert.match(judgeRun([tie(), decline], ctx).refusals[0]!.reason, /this run already made a file tie/);
    assert.match(judgeRun([resolveNot, decline], ctx).refusals[0]!.reason, /this run already made a checklist change/);
    const ask: ToolCall = { name: 'ask_team', args: { question: 'ש', why: '', evidence_message_id: '' } };
    assert.match(judgeRun([ask, decline], ctx).refusals[0]!.reason, /a team question/);
    const withFetch: DecisionContext = { ...ctx, documentFetch: [{ provider: 'israel_tax_authority', state: 'none', available: true, clientOnWhatsapp: true, documentKeys: ['form_106'] }] };
    const fetch: ToolCall = { name: 'document_fetch', args: { action: 'client_agreed', provider: 'israel_tax_authority', document_keys: [] } };
    assert.match(judgeRun([fetch, decline], withFetch).refusals[0]!.reason, /a document_fetch step/);
  });

  it('a call after an accepted decline is refused', () => {
    const run = judgeRun([decline, text()], ctx);
    assert.equal(run.ending, 'client_declined');
    assert.match(run.refusals[0]!.reason, /already ended with client_declined/);
  });
});

describe('ask_team and document_fetch in the run (openspec team-questions)', () => {
  const ask = (question = 'האם המשרד מחזיק בהצהרה הקודמת?'): ToolCall => ({ name: 'ask_team', args: { question, why: 'נוהג משרד', evidence_message_id: 'msg-1' } });

  it('one question before the message is accepted; a second is refused; after the message it is refused', () => {
    const run = judgeRun([ask(), ask('שנייה'), text()], ctx);
    assert.deepEqual(run.teamQuestion, { question: 'האם המשרד מחזיק בהצהרה הקודמת?', reason: 'נוהג משרד', evidenceMessageId: 'msg-1' });
    assert.equal(run.refusals.length, 1);
    assert.match(run.refusals[0]!.reason, /already called in this run/);
    // The fixed order puts ask_team before the terminal call of the same turn; a state that already ended refuses it.
    const open: DecisionContext = { ...ctx, openTeamQuestion: { id: 'q1', question: 'קודמת', askedAt: new Date('2026-11-15T09:00:00.000Z') } };
    assert.match(judgeRun([ask(), text()], open).refusals[0]!.reason, /already open since 2026-11-15 09:00/);
    assert.match(judgeRun([ask('  '), text()], ctx).refusals[0]!.reason, /question is empty/);
  });

  it('a fetch step is judged by the provider state and set once per run', () => {
    const withFetch: DecisionContext = { ...ctx, documentFetch: [{ provider: 'israel_tax_authority', state: 'none', available: true, clientOnWhatsapp: true, documentKeys: ['form_106'] }] };
    const fetch = (action: string): ToolCall => ({ name: 'document_fetch', args: { action, provider: 'israel_tax_authority', document_keys: [] } });
    const run = judgeRun([fetch('client_agreed'), fetch('cancel'), text()], withFetch);
    assert.equal(run.documentFetch?.action, 'client_agreed');
    assert.equal(run.refusals.length, 1);
    assert.match(run.refusals[0]!.reason, /already set in this run/);
    assert.match(judgeRun([fetch('cancel'), text()], withFetch).refusals[0]!.reason, /not allowed for provider/);
  });
});

describe('the gate helper mirrors the per-turn row', () => {
  it('tool_calls, one business_rules per accepted call in execution order, ending', () => {
    const { checks } = gate([text(), tie(), resolveNot], ctx);
    assert.deepEqual(
      checks.map((c) => [c.key, c.passed]),
      [['tool_calls', true], ['business_rules', true], ['business_rules', true], ['business_rules', true], ['ending', true]],
    );
    assert.deepEqual(checks.slice(1, 4).map((c) => String(c.observed).split(' — ')[0]), ['set_required', 'tie_file', 'send_whatsapp_text']);
  });
});
