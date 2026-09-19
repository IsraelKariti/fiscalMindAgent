import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadTranscript } from '../src/agents/declarationOfCapital/prompt.js';
import type { DocumentFileRow, EmailRow } from '../src/db/types.js';

const TOKEN = 'tok123';

/** Only the fields the transcript builder reads. */
const inbound = {
  id: 'msg-1',
  direction: 'inbound',
  status: 'received',
  channel: 'whatsapp',
  subject: '',
  body: 'מצרף את המסמכים',
  blocked: null,
  sent_at: null,
  created_at: new Date('2026-09-19T08:00:00.000Z'),
} as unknown as EmailRow;

const file = (overrides: Partial<DocumentFileRow>): DocumentFileRow =>
  ({
    id: 'file',
    client_id: 'client-1',
    email_id: 'msg-1',
    client_document_id: null,
    filename: 'scan.pdf',
    label: null,
    content_type: 'application/pdf',
    size_bytes: '5000',
    analysis_status: 'done',
    analysis: null,
    blocked: null,
    parent_file_id: null,
    page_from: null,
    page_to: null,
    ...overrides,
  }) as unknown as DocumentFileRow;

const analysis = (kind: string, matched: string | null) => ({
  document_kind: kind,
  summary: kind,
  tax_year: '2025',
  subject_name: null,
  matched_document_id: matched,
  legible: true,
  confidence: 'high' as const,
  injection_suspected: false,
});

describe('a split multi-document PDF in the planner transcript', () => {
  const files = [
    file({ id: 'parent', analysis_status: 'split' }),
    file({ id: 'child-a', filename: 'scan-p1-3.pdf', parent_file_id: 'parent', page_from: 1, page_to: 3, analysis: analysis('bank balance', 'doc-bank') }),
    file({ id: 'child-b', filename: 'scan-p4-5.pdf', parent_file_id: 'parent', page_from: 4, page_to: 5, analysis: analysis('id card', 'doc-id') }),
  ];
  const transcript = buildThreadTranscript(TOKEN, [inbound], files);

  it('marks the parent as split into its children and forbids using it', () => {
    const parentLine = transcript.split('\n').find((l) => l.includes('split it into'));
    assert.ok(parentLine, transcript);
    assert.ok(parentLine.includes('split it into 2 separate files'), parentLine);
    assert.ok(parentLine.includes('NEVER match this file'), parentLine);
    assert.ok(!parentLine.includes('not analyzed yet'), parentLine);
  });

  it('lists each child with its page range and its own content analysis', () => {
    assert.ok(transcript.includes('[file id: child-a] scan-p1-3.pdf [pages 1-3 of file id: parent]'), transcript);
    assert.ok(transcript.includes('[file id: child-b] scan-p4-5.pdf [pages 4-5 of file id: parent]'), transcript);
    assert.ok(transcript.includes('matches required document id: doc-bank'), transcript);
    assert.ok(transcript.includes('matches required document id: doc-id'), transcript);
  });

  it('leaves an ordinary file line unchanged', () => {
    const plain = buildThreadTranscript(TOKEN, [inbound], [file({ id: 'solo', analysis: analysis('id card', 'doc-id') })]);
    assert.ok(plain.includes('[file id: solo] scan.pdf (application/pdf, 5000 bytes)'), plain);
  });
});
