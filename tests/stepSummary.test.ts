import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isIsoDateTime, stepSummaryOf } from '../web/src/components/stepSummary.js';

const BANK = 'אישור יתרות — בנק הפועלים';
const FUND = 'קרן השתלמות — אלטשולר';

test('apply_additions: anchor name and instance names, count consumed, clientName dropped', () => {
  const rows = stepSummaryOf('apply_additions', {
    clientName: 'דני',
    count: 1,
    entries: [{ anchorId: 'd3', anchorName: 'טופס 106', instances: ['טופס 106 — מעסיק א', 'טופס 106 — מעסיק ב'] }],
  });
  assert.deepEqual(rows, [{ key: 'added_instances', items: ['טופס 106: טופס 106 — מעסיק א, טופס 106 — מעסיק ב'] }]);
});

test('apply_retirements: name and quote per row; old id-only rows fall back to the id', () => {
  const rows = stepSummaryOf('apply_retirements', {
    clientName: 'דני',
    count: 1,
    rows: [{ id: 'd1', name: BANK, quote: 'סגרתי את החשבון' }],
  });
  assert.deepEqual(rows, [{ key: 'retired_documents', items: [`${BANK} · "סגרתי את החשבון"`] }]);

  const old = stepSummaryOf('apply_retirements', { clientName: 'דני', count: 2, rows: ['d1', 'd2'] });
  assert.deepEqual(old, [{ key: 'retired_documents', items: ['d1', 'd2'] }]);
});

test('apply_resolutions: verdict per document, quote for not_required, instances for required', () => {
  const rows = stepSummaryOf('apply_resolutions', {
    clientName: 'דני',
    count: 2,
    rows: [
      { id: 'd1', name: BANK, resolution: 'not_required', quote: 'אין לי' },
      { id: 'd2', name: FUND, resolution: 'required', instances: ['אלטשולר', 'מיטב'] },
    ],
  });
  assert.deepEqual(rows, [{ key: 'resolved_documents', items: [`${BANK} — not_required · "אין לי"`, `${FUND} — required · אלטשולר, מיטב`] }]);
});

test('apply_collections: names preferred over ids, pairs show file and document', () => {
  const rows = stepSummaryOf('apply_collections', {
    clientName: 'דני',
    proposed: ['d1', 'd2'],
    proposedNames: [BANK, FUND],
    collected: ['d1'],
    collectedNames: [BANK],
    claimed: ['d2'],
    claimedNames: [FUND],
    pairs: [{ fileId: 'f1', fileName: 'statement.pdf', documentId: 'd1', documentName: BANK }],
  });
  assert.deepEqual(rows, [
    { key: 'collected', items: [BANK] },
    { key: 'claimed', items: [FUND] },
    { key: 'proposed', items: [BANK, FUND] },
    { key: 'pairs', items: [`statement.pdf → ${BANK}`] },
  ]);
  // Old rows: ids only, empty lists omitted.
  const old = stepSummaryOf('apply_collections', { clientName: 'דני', proposed: ['d1'], collected: ['d1'], claimed: [], pairs: [] });
  assert.deepEqual(old, [
    { key: 'collected', items: ['d1'] },
    { key: 'proposed', items: ['d1'] },
  ]);
});

test('document rows: evidence objects render as quotes, arrays as items, primitives as values', () => {
  assert.deepEqual(
    stepSummaryOf('document.retired', { clientName: 'דני', name: BANK, typeKey: 'bank_balance', evidence: { message_id: 'm1', quote: 'סגרתי' } }),
    [
      { key: 'name', value: BANK },
      { key: 'typeKey', value: 'bank_balance' },
      { key: 'evidence', value: '"סגרתי"' },
    ],
  );
  assert.deepEqual(
    stepSummaryOf('document.resolved', { clientName: 'דני', name: BANK, resolution: 'not_required', evidence: { source: 'form', question: 'יש חשבון?', quote: 'לא' } }),
    [
      { key: 'name', value: BANK },
      { key: 'resolution', value: 'not_required' },
      { key: 'evidence', value: 'יש חשבון?: "לא"' },
    ],
  );
  assert.deepEqual(stepSummaryOf('document.instances_added', { clientName: 'דני', typeKey: 't', instances: ['a', 'b'] }), [
    { key: 'typeKey', value: 't' },
    { key: 'instances', items: ['a', 'b'] },
  ]);
  assert.deepEqual(stepSummaryOf('document.collected', { clientName: 'דני', documentIds: ['d1'], names: [BANK] }), [{ key: 'documents', items: [BANK] }]);
  assert.deepEqual(stepSummaryOf('document.claimed', { clientName: 'דני', documentIds: ['d1'] }), [{ key: 'documents', items: ['d1'] }]);
  assert.deepEqual(stepSummaryOf('document.verification_failed', { clientName: 'דני', name: BANK, fileId: 'f1', attempt: 2, reasons: ['as_of_date'] }), [
    { key: 'name', value: BANK },
    { key: 'fileId', value: 'f1' },
    { key: 'attempt', value: '2' },
    { key: 'reasons', items: ['as_of_date'] },
  ]);
});

test('message and review steps: flat keys become labelled values; header keys are skipped', () => {
  assert.deepEqual(
    stepSummaryOf('send_reply', { clientName: 'דני', emailId: 'e1', channel: 'whatsapp', kind: 'freeform', send_at: '2026-09-13T15:04:00', chars: 120 }),
    [
      { key: 'emailId', value: 'e1' },
      { key: 'channel', value: 'whatsapp' },
      { key: 'kind', value: 'freeform' },
      { key: 'send_at', value: '2026-09-13T15:04:00' },
      { key: 'chars', value: '120' },
    ],
  );
  assert.deepEqual(stepSummaryOf('review.message_pending', { clientName: 'דני', channel: 'whatsapp', scheduledFor: '2026-09-13T12:04:00.000Z' }), [
    { key: 'channel', value: 'whatsapp' },
    { key: 'scheduledFor', value: '2026-09-13T12:04:00.000Z' },
  ]);
  assert.deepEqual(stepSummaryOf('validate_message', { clientName: 'דני', result: true, reason: 'ok', checks: [{ key: 'json_schema', passed: true }], attempt: 1 }), [
    { key: 'attempt', value: '1' },
  ]);
});

test('unknown actions and nested values fall back to generic rows; null and empty are omitted', () => {
  assert.deepEqual(stepSummaryOf('admin.something', { clientName: 'x', a: 'b', n: null, empty: [], objs: [{ q: 1 }], nested: { k: 'v' } }), [
    { key: 'a', value: 'b' },
    { key: 'objs', items: ['{"q":1}'] },
    { key: 'nested', value: '{"k":"v"}' },
  ]);
  assert.deepEqual(stepSummaryOf('goal.completed', { clientName: 'x' }), []);
});

test('isIsoDateTime recognizes ISO datetimes only', () => {
  assert.equal(isIsoDateTime('2026-09-13T12:04:00.000Z'), true);
  assert.equal(isIsoDateTime('2026-09-13T15:04:00'), true);
  assert.equal(isIsoDateTime('2026-09-13'), false);
  assert.equal(isIsoDateTime('whatsapp'), false);
});

test('apply_collections: the per-company split renders the rename and the created rows, nothing left over', () => {
  const rows = stepSummaryOf('apply_collections', {
    clientName: 'ניב',
    proposed: ['d1'],
    proposedNames: ['ביטוח מנהלים ניב — הראל'],
    collected: ['d1', 'd-clal'],
    collectedNames: ['ביטוח מנהלים ניב — הראל', 'ביטוח מנהלים ניב — כלל'],
    claimed: [],
    claimedNames: [],
    pairs: [
      { fileId: 'f1', fileName: 'scan-p1-9.pdf', documentId: 'd1', documentName: 'ביטוח מנהלים ניב — הראל' },
      { fileId: 'f-clal', fileName: 'scan-p10-11.pdf', documentId: 'd-clal', documentName: 'ביטוח מנהלים ניב — כלל' },
    ],
    refused: [],
    split: {
      renamed: [{ documentId: 'd1', oldName: 'ביטוח מנהלים ניב', newName: 'ביטוח מנהלים ניב — הראל' }],
      created: [{ documentId: 'd-clal', name: 'ביטוח מנהלים ניב — כלל', fromDocumentId: 'd1', fromName: 'ביטוח מנהלים ניב', fileId: 'f-clal', fileName: 'scan-p10-11.pdf' }],
    },
  });
  assert.deepEqual(rows, [
    { key: 'collected', items: ['ביטוח מנהלים ניב — הראל', 'ביטוח מנהלים ניב — כלל'] },
    { key: 'proposed', items: ['ביטוח מנהלים ניב — הראל'] },
    { key: 'pairs', items: ['scan-p1-9.pdf → ביטוח מנהלים ניב — הראל', 'scan-p10-11.pdf → ביטוח מנהלים ניב — כלל'] },
    { key: 'renamed_by_company', items: ['ביטוח מנהלים ניב → ביטוח מנהלים ניב — הראל'] },
    { key: 'created_by_company', items: ['ביטוח מנהלים ניב — כלל ← scan-p10-11.pdf'] },
  ]);
});
