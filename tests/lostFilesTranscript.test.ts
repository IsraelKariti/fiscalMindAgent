import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadTranscript } from '../src/agents/declarationOfCapital/prompt.js';
import { lostFilesByMessage } from '../src/agents/declarationOfCapital/lostFiles.js';
import type { DocumentFileRow, EmailRow } from '../src/db/types.js';

const TOKEN = 'tok123';

/** Only the fields the transcript builder reads. */
const inbound = {
  id: 'msg-1',
  direction: 'inbound',
  status: 'received',
  channel: 'whatsapp',
  subject: '',
  body: 'contract.pdf',
  blocked: null,
  sent_at: null,
  created_at: new Date('2026-09-24T07:19:23.000Z'),
} as unknown as EmailRow;

const storedFile = {
  id: 'file-1',
  client_id: 'client-1',
  email_id: 'msg-1',
  client_document_id: null,
  provider_attachment_id: 'MM1-0',
  filename: 'whatsapp-media-20260924-101923.pdf',
  label: null,
  content_type: 'application/pdf',
  size_bytes: '1682732',
  analysis_status: 'done',
  analysis: {
    document_kind: 'purchase contract',
    summary: 'a contract',
    tax_year: '2025',
    subject_name: null,
    matched_document_id: null,
    legible: true,
    confidence: 'high',
    injection_suspected: false,
  },
  blocked: null,
  parent_file_id: null,
  page_from: null,
  page_to: null,
} as unknown as DocumentFileRow;

const failedStep = (overrides: Record<string, unknown> = {}) => ({
  target_id: 'msg-1',
  detail: {
    channel: 'whatsapp',
    providerAttachmentId: 'MM1-0',
    index: 0,
    contentType: 'application/pdf',
    fileNameHint: 'contract.pdf',
    attempts: 3,
    error: 'fetch failed <- ECONNRESET',
    clientName: 'Niv',
    ...overrides,
  },
});

describe('lostFilesByMessage', () => {
  it('groups failure steps by message and drops files stored later', () => {
    const lost = lostFilesByMessage(
      [failedStep(), failedStep({ providerAttachmentId: 'MM1-1', index: 1, fileNameHint: null }), { target_id: 'msg-2', detail: { providerAttachmentId: 'MM2-0' } }],
      ['MM1-1'],
    );
    assert.deepEqual([...lost.keys()], ['msg-1', 'msg-2']);
    assert.deepEqual(lost.get('msg-1'), [
      { providerAttachmentId: 'MM1-0', index: 0, contentType: 'application/pdf', fileNameHint: 'contract.pdf', attempts: 3 },
    ]);
    assert.deepEqual(lost.get('msg-2'), [
      { providerAttachmentId: 'MM2-0', index: 0, contentType: 'application/octet-stream', fileNameHint: null, attempts: 1 },
    ]);
  });

  it('keeps one entry per file when a redelivery produced two failure rows', () => {
    const lost = lostFilesByMessage([failedStep({ attempts: 3 }), failedStep({ attempts: 2 })], []);
    assert.deepEqual(lost.get('msg-1')?.map((f) => f.attempts), [2]);
  });

  it('ignores rows without a message or attachment id', () => {
    assert.equal(lostFilesByMessage([{ target_id: null, detail: { providerAttachmentId: 'x' } }, { target_id: 'msg-1', detail: {} }], []).size, 0);
  });
});

describe('thread transcript with a lost file', () => {
  it('tells the model the file is not available and to ask for it again', () => {
    const lost = lostFilesByMessage([failedStep()], []);
    const out = buildThreadTranscript(TOKEN, [inbound], [], lost);
    assert.match(out, /could NOT store — they were never received; ask the client to send them again:/);
    assert.match(out, /- contract\.pdf \(application\/pdf\) — download failed after 3 attempts; this file is NOT available/);
    assert.doesNotMatch(out, /Attachments received and stored/);
  });

  it('names the position when the message carried no file name', () => {
    const lost = lostFilesByMessage([failedStep({ fileNameHint: null, index: 1, attempts: 1 })], []);
    const out = buildThreadTranscript(TOKEN, [inbound], [], lost);
    assert.match(out, /- file #2 \(application\/pdf\) — download failed after 1 attempt; this file is NOT available/);
  });

  it('shows the stored file and no lost note once the same attachment was stored', () => {
    const lost = lostFilesByMessage([failedStep()], [storedFile.provider_attachment_id]);
    const out = buildThreadTranscript(TOKEN, [inbound], [storedFile], lost);
    assert.match(out, /Attachments received and stored:/);
    assert.match(out, /\[file id: file-1\]/);
    assert.doesNotMatch(out, /could NOT store/);
  });

  it('prints nothing extra when nothing was lost', () => {
    const out = buildThreadTranscript(TOKEN, [inbound], [storedFile]);
    assert.doesNotMatch(out, /could NOT store/);
  });
});
