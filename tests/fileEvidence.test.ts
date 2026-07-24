import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileMatchesDocument, isQuarantined, isVerifiedLegibleFile } from '../src/agents/shared/fileEvidence.js';
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
    content_type: 'application/pdf',
    size_bytes: '1000',
    sha256: 'x',
    analysis_status: status,
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
