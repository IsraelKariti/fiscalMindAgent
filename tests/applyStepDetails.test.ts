import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  additionsStepDetail,
  collectionsStepDetail,
  resolutionsStepDetail,
  retirementsStepDetail,
} from '../src/agents/declarationOfCapital/applyStepDetails.js';

const docs = new Map([
  ['d1', 'אישור יתרות — בנק הפועלים'],
  ['d2', 'קרן השתלמות — אלטשולר'],
  ['d3', 'טופס 106'],
]);
const docName = (id: string) => docs.get(id);
const fileName = (id: string) => (id === 'f1' ? 'statement.pdf' : undefined);
const evidence = { message_id: 'm1', quote: 'סגרתי את החשבון בבנק' };

test('apply_resolutions rows carry the document name next to the id, and the quote of a not_required', () => {
  const detail = resolutionsStepDetail(
    [
      { documentId: 'd1', resolution: 'not_required', evidence },
      { documentId: 'd2', resolution: 'required', instances: [{ name: 'x', description: null, alreadyProvided: false, fileIds: [] }], evidence },
    ],
    docName,
    2,
  );
  assert.equal(detail.count, 2);
  assert.deepEqual(detail.rows, [
    { id: 'd1', name: 'אישור יתרות — בנק הפועלים', resolution: 'not_required', quote: evidence.quote },
    { id: 'd2', name: 'קרן השתלמות — אלטשולר', resolution: 'required', quote: evidence.quote, instances: ['x'] },
  ]);
});

test('apply_additions entries name the anchor document and list the instance names', () => {
  const detail = additionsStepDetail(
    [
      {
        anchorDocumentId: 'd3',
        instances: [
          { name: 'טופס 106 — מעסיק א', description: null, alreadyProvided: false, fileIds: [] },
          { name: 'טופס 106 — מעסיק ב', description: null, alreadyProvided: true, fileIds: [] },
        ],
        evidence,
      },
    ],
    docName,
    1,
  );
  assert.deepEqual(detail, {
    count: 1,
    entries: [{ anchorId: 'd3', anchorName: 'טופס 106', instances: ['טופס 106 — מעסיק א', 'טופס 106 — מעסיק ב'], quote: evidence.quote }],
  });
});

test('apply_retirements rows carry id, name and the evidence quote; unknown ids fall back to the id', () => {
  const detail = retirementsStepDetail(
    [
      { documentId: 'd1', evidence },
      { documentId: 'gone', evidence },
    ],
    docName,
    2,
  );
  assert.deepEqual(detail.rows, [
    { id: 'd1', name: 'אישור יתרות — בנק הפועלים', quote: evidence.quote },
    { id: 'gone', name: 'gone', quote: evidence.quote },
  ]);
});

test('apply_collections names the proposed, collected and claimed documents and both sides of each pair', () => {
  const detail = collectionsStepDetail(
    {
      proposed: ['d1', 'd2'],
      collected: ['d1'],
      claimed: ['d2'],
      pairs: [{ file_id: 'f1', document_id: 'd1' }],
      refused: [{ file_id: 'f1', document_id: 'd2', reason: 'companies_differ' }],
    },
    docName,
    fileName,
  );
  assert.deepEqual(detail, {
    proposed: ['d1', 'd2'],
    proposedNames: ['אישור יתרות — בנק הפועלים', 'קרן השתלמות — אלטשולר'],
    collected: ['d1'],
    collectedNames: ['אישור יתרות — בנק הפועלים'],
    claimed: ['d2'],
    claimedNames: ['קרן השתלמות — אלטשולר'],
    pairs: [{ fileId: 'f1', fileName: 'statement.pdf', documentId: 'd1', documentName: 'אישור יתרות — בנק הפועלים' }],
    refused: [
      { fileId: 'f1', fileName: 'statement.pdf', documentId: 'd2', documentName: 'קרן השתלמות — אלטשולר', reason: 'companies_differ' },
    ],
  });
});
