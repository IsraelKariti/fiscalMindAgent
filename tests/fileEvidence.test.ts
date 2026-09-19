import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  applicableFilePairs,
  fileMatchesDocument,
  isQuarantined,
  isSplitParent,
  isVerifiedLegibleFile,
} from '../src/agents/shared/fileEvidence.js';
import type { DocumentFileRow, FileAnalysis } from '../src/db/types.js';

function fileWith(analysis: Partial<FileAnalysis> | null, status: DocumentFileRow['analysis_status'] = 'done'): DocumentFileRow {
  return {
    id: 'file-1',
    client_id: 'client-1',
    email_id: 'email-1',
    client_document_id: null,
    provider_attachment_id: 'att-1',
    blob_key: 'blob',
    filename: 'doc.pdf',
    label: null,
    content_type: 'application/pdf',
    size_bytes: '1000',
    sha256: 'x',
    analysis_status: status,
    blocked: null,
    parent_file_id: null,
    page_from: null,
    page_to: null,
    analysis:
      analysis === null
        ? null
        : {
            document_kind: 'טופס 106',
            summary: 'טופס 106 לשנת 2025',
            tax_year: '2025',
            subject_name: null,
            matched_document_id: null,
            legible: true,
            confidence: 'high',
            ...analysis,
          },
    analyzed_at: new Date(),
    created_at: new Date(),
  };
}

test('a clean matched analysis is strong evidence for its document only', () => {
  const file = fileWith({ matched_document_id: 'doc-9' });
  assert.equal(fileMatchesDocument(file, 'doc-9'), true);
  assert.equal(fileMatchesDocument(file, 'doc-other'), false);
});

test('injection-suspected files are quarantined and never count as evidence', () => {
  const file = fileWith({ matched_document_id: 'doc-9', injection_suspected: true });
  assert.equal(isQuarantined(file), true);
  assert.equal(fileMatchesDocument(file, 'doc-9'), false);
  assert.equal(isVerifiedLegibleFile(file), false);
});

test('illegible files are quarantined', () => {
  const file = fileWith({ legible: false });
  assert.equal(isQuarantined(file), true);
  assert.equal(isVerifiedLegibleFile(file), false);
});

test('a clean legible analysis is tier-B evidence even without an analyzer match', () => {
  const file = fileWith({ matched_document_id: null });
  assert.equal(isVerifiedLegibleFile(file), true);
});

test('rows analyzed before injection_suspected existed stay usable (absent field is not suspicion)', () => {
  const file = fileWith({});
  delete (file.analysis as unknown as Record<string, unknown>)['injection_suspected'];
  assert.equal(isQuarantined(file), false);
  assert.equal(isVerifiedLegibleFile(file), true);
});

test('unanalyzed or failed files are never verified evidence (and never quarantined)', () => {
  for (const status of ['pending', 'failed', 'unsupported'] as const) {
    const file = fileWith(null, status);
    assert.equal(isQuarantined(file), false);
    assert.equal(isVerifiedLegibleFile(file), false);
    assert.equal(fileMatchesDocument(file, 'doc-9'), false);
  }
});

test('a file the injection screen blocked (054) is quarantined regardless of analysis', () => {
  const blocked = fileWith(null, 'blocked');
  assert.equal(isQuarantined(blocked), true);
  assert.equal(isVerifiedLegibleFile(blocked), false);
  assert.equal(fileMatchesDocument(blocked, 'doc-1'), false);
});

test('the parent of a split PDF (058) is neither quarantined nor evidence', () => {
  const parent = fileWith(null, 'split');
  assert.equal(isSplitParent(parent), true);
  assert.equal(isQuarantined(parent), false);
  assert.equal(isVerifiedLegibleFile(parent), false);
  assert.equal(fileMatchesDocument(parent, 'doc-9'), false);
});

test('a planner pair with a split parent is dropped; the pair with its child is kept', () => {
  const parent = { ...fileWith(null, 'split'), id: 'parent' };
  const child = { ...fileWith({ matched_document_id: null }), id: 'child', parent_file_id: 'parent', page_from: 1, page_to: 3 };
  const fileById = new Map([parent, child].map((f) => [f.id, f]));
  const documentIds = new Set(['doc-9']);
  const pairs = applicableFilePairs(
    [
      { file_id: 'parent', document_id: 'doc-9' },
      { file_id: 'child', document_id: 'doc-9' },
      { file_id: 'unknown-file', document_id: 'doc-9' },
      { file_id: 'child', document_id: 'unknown-doc' },
    ],
    fileById,
    documentIds,
  );
  assert.deepEqual(pairs, [{ file_id: 'child', document_id: 'doc-9' }]);
  // With only the parent paired, nothing backs a "collected" proposal: no
  // strong match and no tier-B file, so the document is not collected by it.
  const parentOnly = applicableFilePairs([{ file_id: 'parent', document_id: 'doc-9' }], fileById, documentIds);
  assert.deepEqual(parentOnly, []);
  assert.equal([parent].some((f) => fileMatchesDocument(f, 'doc-9')), false);
});
