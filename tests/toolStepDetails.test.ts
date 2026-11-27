import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  addInstanceDetail,
  askTeamDetail,
  attestationDetail,
  attributeCollectionOutcome,
  concludeDetail,
  refusedDetail,
  resolveDocumentDetail,
  retireDocumentDetail,
  sendMessageDetail,
  stateCostDetail,
  stateVehicleDetail,
  documentFetchDetail,
  tieResultText,
  toolResultText,
} from '../src/agents/declarationOfCapital/toolStepDetails.js';
import { DECISION_TOOL_NAMES, type ParsedToolCall } from '../src/agents/declarationOfCapital/decisionTools.js';
import type { AuditAction } from '../src/audit/audit.js';
import type { DocumentFileRow } from '../src/db/types.js';

// Every planner tool is an audited step name (openspec `conversation-trace`): a compile-time check.
const TOOL_ACTIONS: AuditAction[] = [...DECISION_TOOL_NAMES];
test('every planner tool name is an audit action', () => {
  assert.equal(TOOL_ACTIONS.length, 15);
});

// openspec `team-questions`: the ask_team step carries the question, the reason, the addressee and the stored id.
test('askTeamDetail: an asked question names the addressee and the question id; a skipped one says why', () => {
  const asked = askTeamDetail(
    { name: 'ask_team', args: { question: 'האם המשרד מחזיק בהצהרה הקודמת?', why: 'נוהג משרד', evidence_message_id: 'm1' } },
    { questionId: 'q1', toName: 'דנה', toEmail: 'dana@office.co.il', toMatch: 'staff', applied: true },
  );
  assert.deepEqual(asked, {
    tool: 'ask_team',
    question: 'האם המשרד מחזיק בהצהרה הקודמת?',
    why: 'נוהג משרד',
    messageId: 'm1',
    questionId: 'q1',
    to: 'דנה',
    toEmail: 'dana@office.co.il',
    toMatch: 'staff',
    applied: true,
    reason: 'asked דנה (staff)',
  });
  const skipped = askTeamDetail(
    { name: 'ask_team', args: { question: 'q', why: '', evidence_message_id: '' } },
    { questionId: null, toName: '', toEmail: '', toMatch: 'accountant', applied: false, reason: 'no addressee' },
  );
  assert.equal(skipped.applied, false);
  assert.equal(skipped.reason, 'no addressee');
  assert.ok(!('messageId' in skipped) && !('questionId' in skipped));
});

const docs = new Map([
  ['d1', 'אישור יתרות — בנק הפועלים'],
  ['d2', 'קרן השתלמות — אלטשולר'],
  ['d3', 'ביטוח מנהלים ניב'],
  ['h1', 'ביטוח מנהלים ניב — הראל'],
  ['c1', 'ביטוח מנהלים ניב — כלל'],
  ['m1', 'ביטוח מנהלים ניב — מגדל'],
]);
const docName = (id: string) => docs.get(id);
const files = new Map([
  ['f1', 'statement.pdf'],
  ['fh', 'harel.pdf'],
  ['fc', 'clal.pdf'],
  ['fm', 'migdal.pdf'],
  ['fq', 'blocked.pdf'],
]);
const fileName = (id: string) => files.get(id);
const call = (name: ParsedToolCall['name'], args: Record<string, unknown>, turn?: number): ParsedToolCall => ({ name, args, ...(turn !== undefined ? { turn } : {}) });
const fileRow = (id: string, extra: Partial<DocumentFileRow> = {}): DocumentFileRow =>
  ({ id, filename: files.get(id) ?? id, label: null, analysis_status: 'done', analysis: { legible: true }, parent_file_id: null, ...extra }) as unknown as DocumentFileRow;
const fileById = new Map([fileRow('f1'), fileRow('fh'), fileRow('fc'), fileRow('fm'), fileRow('fq', { analysis_status: 'blocked' })].map((f) => [f.id, f]));

test('set_required: name next to id, the quote, the created rows and the outcome line; a turn is kept', () => {
  const evidence = { message_id: 'm1', quote: 'סגרתי את החשבון' };
  assert.deepEqual(
    resolveDocumentDetail(call('set_required', { document_id: 'd1', resolution: 'not_required', evidence_message_id: 'm1', evidence_quote: 'סגרתי את החשבון' }, 2), docName, {
      applied: true,
      evidence,
      createdNames: [],
    }),
    { tool: 'set_required', turn: 2, documentId: 'd1', name: docs.get('d1'), resolution: 'not_required', quote: 'סגרתי את החשבון', applied: true, reason: 'resolved not_required' },
  );
  const required = resolveDocumentDetail(call('set_required', { document_id: 'd2', resolution: 'required', proven_by_file_id: 'f1' }), docName, {
    applied: true,
    evidence: { source: 'self_evident_file', file_id: 'f1', issuer: 'אלטשולר שחם', holders: ['דני'], matched: 'client' },
    createdNames: ['קרן השתלמות — אלטשולר שחם'],
  });
  assert.equal(required.reason, 'resolved required · 1 rows');
  assert.deepEqual(required.instances, ['קרן השתלמות — אלטשולר שחם']);
  // The created row ids ride on the step so the result can name them for a later turn.
  const withIds = resolveDocumentDetail(call('set_required', { document_id: 'd2', resolution: 'required', evidence_quote: 'יש' }), docName, { applied: true, evidence: { message_id: 'm1', quote: 'יש' }, createdNames: ['x'], createdIds: ['n7'] });
  assert.deepEqual(withIds.instanceIds, ['n7']);
  assert.equal(toolResultText(call('set_required', { document_id: 'd2' }), withIds), 'resolved required · 1 rows — document ids n7');
  assert.equal(required.provenByFileId, 'f1');
  assert.match(required.quote ?? '', /נוצר מקובץ על שם הלקוח/);
  assert.equal(resolveDocumentDetail(call('set_required', { document_id: 'd9', resolution: 'not_required' }), docName, { applied: false, evidence: null, createdNames: [] }).reason, 'no change: the row could not be resolved');
});

test('add_instance: the created row, its status, the accepted and the refused files', () => {
  const detail = addInstanceDetail(
    call('add_instance', { anchor_document_id: 'd2', name: 'קרן השתלמות — מיטב', already_provided: true, file_ids: ['f1', 'fq'], evidence_quote: 'יש לי גם במיטב' }),
    docName,
    fileName,
    {
      row: { id: 'n1', name: 'קרן השתלמות — מיטב', status: 'claimed' },
      evidence: null,
      acceptedFileIds: ['f1'],
      refused: [{ file_id: 'fq', document_id: 'n1', reason: 'not_verified_legible' }],
    },
  );
  assert.equal(detail.anchorName, docs.get('d2'));
  assert.equal(detail.name, 'קרן השתלמות — מיטב');
  assert.deepEqual(detail.fileNames, ['statement.pdf', 'blocked.pdf']);
  assert.deepEqual(detail.acceptedFiles, ['statement.pdf']);
  assert.deepEqual(detail.refusedFiles, ['blocked.pdf (not_verified_legible)']);
  assert.equal(detail.reason, 'created "קרן השתלמות — מיטב" · claimed · 1 file · 1 refused');
  // The result the model is answered with names the new row's id (openspec planner-answer-tools).
  assert.equal(toolResultText(call('add_instance', { anchor_document_id: 'd2', name: 'קרן השתלמות — מיטב' }), detail), 'created "קרן השתלמות — מיטב" · claimed · 1 file · 1 refused — document id n1');
  assert.equal(addInstanceDetail(call('add_instance', { anchor_document_id: 'd2', name: 'x' }), docName, fileName, { row: null, evidence: null, acceptedFileIds: [], refused: [] }).reason, 'no change: the row was not created');
});

test('retire_document, state_cost, state_vehicle and attestation carry their parameters and outcome', () => {
  assert.deepEqual(retireDocumentDetail(call('retire_document', { document_id: 'd1', evidence_quote: 'אין לי' }), docName, { applied: true, evidence: { message_id: 'm1', quote: 'אין לי' }, replacedBy: 'documents' }), {
    tool: 'retire_document',
    documentId: 'd1',
    name: docs.get('d1'),
    quote: 'אין לי',
    replacedBy: 'documents',
    applied: true,
    reason: 'retired · replaced by other documents',
  });
  const byDeclaration = retireDocumentDetail(call('retire_document', { document_id: 'd1', evidence_quote: 'אין לי' }), docName, { applied: true, evidence: { message_id: 'm1', quote: 'אין לי' }, replacedBy: 'client_declaration' });
  assert.equal(byDeclaration.replacedBy, 'client_declaration');
  assert.equal(byDeclaration.reason, "retired · replaced by the client's declaration");
  const cost = stateCostDetail(call('state_cost', { document_id: '', instance_name: 'מאזדה', amount: 85000, currency: 'ILS', evidence_message_id: 'm2', evidence_quote: 'שילמתי 85,000' }), (id) => (id === 'n2' ? 'הצהרת עלות — מאזדה 3' : undefined), {
    documentId: 'n2',
    applied: true,
  });
  assert.equal(cost.name, 'הצהרת עלות — מאזדה 3');
  assert.equal(cost.instanceName, 'מאזדה');
  assert.equal(cost.reason, 'stated 85,000 ILS');
  const vehicle = stateVehicleDetail(call('state_vehicle', { document_id: 'd1', instance_name: '', manufacturer: 'מאזדה' }), docName, { documentId: null, applied: true, factsLine: 'מאזדה', statementCount: 2 });
  assert.equal(vehicle.reason, 'stated: מאזדה');
  assert.equal(vehicle.statementCount, 2);
  assert.equal(attestationDetail(call('attestation', { action: 'confirmed', evidence_quote: 'מאשר' }), { applied: true }).reason, 'attestation confirmed');
  assert.deepEqual(attestationDetail(call('attestation', { action: 'request' }), { applied: true, emailId: 'e1' }), { tool: 'attestation', action: 'request', emailId: 'e1', applied: true, reason: 'attestation requested on draft e1' });
});

const ctx = () => ({
  pendingIds: new Set(['d1', 'd2', 'd3']),
  documentIds: new Set(['d1', 'd2', 'd3']),
  fileById,
  docName,
  fileName,
});
const noSplit = { renamed: [], created: [] };

test('tie_file: three companies for one item — the first is tied and renamed, the others re-pointed to the rows the split created', () => {
  const calls = [
    call('tie_file', { file_id: 'fh', document_id: 'd3' }),
    call('tie_file', { file_id: 'fc', document_id: 'd3' }),
    call('tie_file', { file_id: 'fm', document_id: 'd3' }),
    call('mark_collected', { document_id: 'd3' }),
  ];
  const steps = attributeCollectionOutcome(
    calls,
    {
      newlyCollected: ['d3', 'c1', 'm1'],
      newlyClaimed: [],
      proposedPairs: [
        { file_id: 'fh', document_id: 'd3' },
        { file_id: 'fc', document_id: 'c1' },
        { file_id: 'fm', document_id: 'm1' },
      ],
      refusedTies: [],
      splitDetail: {
        renamed: [{ documentId: 'd3', oldName: 'ביטוח מנהלים ניב', newName: 'ביטוח מנהלים ניב — הראל' }],
        created: [
          { documentId: 'c1', name: 'ביטוח מנהלים ניב — כלל', fromDocumentId: 'd3', fileId: 'fc' },
          { documentId: 'm1', name: 'ביטוח מנהלים ניב — מגדל', fromDocumentId: 'd3', fileId: 'fm', employer: null },
        ],
      },
    },
    ctx(),
  );
  assert.deepEqual(
    steps.map((s) => s.call.name),
    ['tie_file', 'tie_file', 'tie_file', 'mark_collected'],
  );
  const [harel, clal, migdal, mark] = steps.map((s) => s.detail);
  assert.equal(harel!.outcome, 'tied');
  assert.equal(harel!.renamedFrom, 'ביטוח מנהלים ניב');
  assert.equal(harel!.renamedTo, 'ביטוח מנהלים ניב — הראל');
  assert.equal(harel!.reason, 'tied · renamed → ביטוח מנהלים ניב — הראל');
  assert.equal(clal!.outcome, 'repointed');
  assert.equal(clal!.endedUnderName, 'ביטוח מנהלים ניב — כלל');
  assert.deepEqual(clal!.created, ['ביטוח מנהלים ניב — כלל ← clal.pdf']);
  assert.equal(clal!.reason, 'tied → ביטוח מנהלים ניב — כלל');
  assert.equal(migdal!.endedUnderId, 'm1');
  assert.equal(mark!.outcome, 'collected');
  assert.deepEqual(mark!.alsoCollected, ['ביטוח מנהלים ניב — כלל', 'ביטוח מנהלים ניב — מגדל']);
  assert.deepEqual(steps[0]!.target, { type: 'document_file', id: 'fh' });
  assert.deepEqual(steps[3]!.target, { type: 'client_document', id: 'd3' });
});

test('tie_file refused leaves the document pending; a claim says so; a quarantined file is ignored; a settled row is unchanged', () => {
  const steps = attributeCollectionOutcome(
    [
      call('tie_file', { file_id: 'f1', document_id: 'd1' }),
      call('mark_collected', { document_id: 'd1' }),
      call('mark_collected', { document_id: 'd2' }),
      call('tie_file', { file_id: 'fq', document_id: 'd3' }),
      call('mark_collected', { document_id: 'd3' }),
      call('mark_collected', { document_id: 'd9' }),
    ],
    { newlyCollected: [], newlyClaimed: ['d2'], proposedPairs: [], refusedTies: [{ file_id: 'f1', document_id: 'd1', reason: 'paper_differs' }], splitDetail: noSplit },
    { ...ctx(), pendingIds: new Set(['d1', 'd2', 'd3']), documentIds: new Set(['d1', 'd2', 'd3', 'd9']) },
  );
  const details = steps.map((s) => s.detail);
  assert.equal(details[0]!.outcome, 'refused');
  assert.equal(details[0]!.reason, 'refused: paper_differs');
  assert.equal(details[1]!.reason, 'pending: its file tie was refused');
  assert.equal(details[2]!.reason, 'claimed: no file proves it, waits for the accountant');
  assert.equal(details[3]!.reason, 'ignored: file quarantined');
  assert.equal(details[4]!.reason, 'pending: no file proves it');
  assert.equal(details[5]!.reason, 'no change: the row was not pending');
});

test('tie_file to an unknown file or document is ignored', () => {
  const steps = attributeCollectionOutcome(
    [call('tie_file', { file_id: 'zz', document_id: 'd1' }), call('tie_file', { file_id: 'f1', document_id: 'zz' }), call('mark_collected', { document_id: 'd1' })],
    { newlyCollected: [], newlyClaimed: [], proposedPairs: [], refusedTies: [], splitDetail: noSplit },
    ctx(),
  );
  assert.equal(steps[0]!.detail.reason, 'ignored: unknown file');
  assert.equal(steps[1]!.detail.reason, 'ignored: unknown document');
  assert.equal(steps[2]!.detail.reason, 'pending: no file proves it');
});

// openspec planner-answer-tools, "A file tie is verified before the model continues": the tie's result carries the verdict.
test('tieResultText: the tie outcome, then the verdict with its facts or reasons', () => {
  const tied = { reason: 'tied' };
  assert.equal(tieResultText(tied, { outcome: 'approved', reasons: [], facts: ['as of 2025-12-31', 'יתרה: 14,808.81'] }), 'tied · verification: APPROVED — the document is closed (as of 2025-12-31 | יתרה: 14,808.81)');
  assert.match(tieResultText(tied, { outcome: 'reopened', reasons: ['התאריך אינו 31.12.2025'], facts: [] }), /REJECTED: התאריך אינו 31.12.2025 — the row is pending again; this file does NOT count as received/);
  assert.match(tieResultText(tied, { outcome: 'stalled', reasons: ['x'], facts: [] }), /HANDED TO THE OFFICE: x/);
  assert.match(tieResultText(tied, { outcome: 'error', reasons: [], facts: [] }), /NOT CHECKED YET — the file is received/);
  assert.match(tieResultText(tied, { outcome: 'skipped', reasons: [], facts: [] }), /NOT CHECKED YET/);
  assert.equal(tieResultText({ reason: 'collected' }, { outcome: 'claimed', reasons: [], facts: [] }), 'collected · no file: the document waits for the accountant as claimed');
  assert.equal(tieResultText({ reason: 'refused: paper_differs' }, null), 'refused: paper_differs');
  assert.equal(tieResultText({ reason: 'ignored: unknown file' }, { outcome: 'none', reasons: [], facts: [] }), 'ignored: unknown file');
});

test('refusedDetail: the refusal as outcome and as the result the model was given, ids with names', () => {
  const detail = refusedDetail(call('tie_file', { file_id: 'f1', document_id: 'd1', evidence_quote: 'זה שלי' }, 2), 'the companies differ', (id) => docName(id) ?? fileName(id));
  assert.deepEqual(detail, {
    tool: 'tie_file',
    turn: 2,
    documentId: 'd1',
    name: docs.get('d1'),
    fileId: 'f1',
    fileName: 'statement.pdf',
    quote: 'זה שלי',
    applied: false,
    refused: true,
    refusal: 'the companies differ',
    reason: 'refused: the companies differ',
    result: 'refused: the companies differ',
  });
  assert.equal(toolResultText(call('tie_file', {}), { applied: false }), 'no change');
  assert.equal(toolResultText(call('mark_collected', {}), {}), 'done');
});

test('send_whatsapp_text / send_whatsapp_template: the requested and the scheduled time, the roll, the template name', () => {
  const text = sendMessageDetail(call('send_whatsapp_text', { text: 'שלום', send_at: 'asap' }), {
    emailId: 'e1',
    sendAt: '2026-11-08 10:14',
    requestedSendAt: 'asap',
    requested: 'asap',
    rolled: false,
    chars: 4,
  });
  assert.deepEqual(text, { tool: 'send_whatsapp_text', emailId: 'e1', channel: 'whatsapp', kind: 'freeform', send_at: '2026-11-08 10:14', requestedSendAt: 'asap', requested: 'asap', rolled: false, chars: 4, reason: 'scheduled 2026-11-08 10:14 (asap)' });
  const template = sendMessageDetail(call('send_whatsapp_template', { template_id: 'HX1', variables: ['דני'], send_at: '2026-11-07 09:00' }), {
    emailId: 'e2',
    sendAt: '2026-11-08 09:00',
    requestedSendAt: '2026-11-07 09:00',
    requested: 'time',
    rolled: true,
    chars: 40,
    templateName: 'capital_declaration_update',
  });
  assert.equal(template.kind, 'template');
  assert.equal(template.templateName, 'capital_declaration_update');
  assert.deepEqual(template.variables, ['דני']);
  assert.equal(template.reason, 'scheduled 2026-11-08 09:00 (rolled off a weekend / chag)');
});

test('document_fetch records the action and whether a context took it', () => {
  assert.equal(documentFetchDetail(call('document_fetch', { action: 'client_agreed', provider: 'tax_authority', document_keys: ['form_106'] }), { applied: true, provider: 'tax_authority', documentKeys: ['form_106'], emailId: 'e1' }).reason, 'client_agreed applied');
  assert.equal(documentFetchDetail(call('document_fetch', { action: 'cancel', provider: 'x' }), { applied: false, provider: null, documentKeys: null, emailId: null }).reason, 'cancel: no fetch context for this provider');
});

// openspec conversation-trace, "The conclude step records the decision and what the cycle did with it": written by code at the end of the run.
test('concludeDetail: how the run ended, the reasoning of the terminal call, the turn count; a failure is marked', () => {
  assert.deepEqual(concludeDetail({ kind: 'message', emailId: 'e1', sendAt: '2026-11-27 10:00', reasoning: 'קובץ אושר', turns: 2 }), {
    tool: 'conclude',
    ended_by: 'message',
    turns: 2,
    decision: 'follow_up',
    reasoning: 'קובץ אושר',
    emailId: 'e1',
    send_at: '2026-11-27 10:00',
    reason: 'message scheduled for 2026-11-27 10:00 · 2 turns',
  });
  assert.equal(concludeDetail({ kind: 'goal_complete', reasoning: 'r', turns: 1 }).reason, 'goal completed (every row settled and the attestation confirmed) · 1 turn');
  assert.equal(concludeDetail({ kind: 'client_declined', reasoning: 'r', turns: 1 }).decision, 'client_declined');
  const failed = concludeDetail({ kind: 'failed', why: 'no_ending', turns: 3 }) as Record<string, unknown>;
  assert.equal(failed.decision, 'failed');
  assert.equal(failed.applied, false);
  assert.equal(failed.reason, 'failed: no ending after 3 turns (two turns without a tool call)');
  assert.equal(concludeDetail({ kind: 'failed', why: 'cap', turns: 12 }).reason, 'failed: 12 turns without an ending (the turn cap)');
});
