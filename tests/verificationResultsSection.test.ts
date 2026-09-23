import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrompt,
  buildVerificationResultsSection,
  type VerificationResultPromptInput,
} from '../src/agents/declarationOfCapital/prompt.js';
import type { ClientRow } from '../src/db/types.js';

const TOKEN = 'tok123';
const result = (overrides: Partial<VerificationResultPromptInput>): VerificationResultPromptInput => ({
  documentId: 'doc-1',
  documentName: 'אישור יתרות בנק דיסקונט',
  fileId: 'file-1',
  fileName: 'whatsapp-media-1.pdf',
  outcome: 'approved',
  reasons: [],
  ...overrides,
});

describe('VERIFICATION RESULTS prompt section (buildVerificationResultsSection)', () => {
  it('is empty when no verdict just landed', () => {
    assert.equal(buildVerificationResultsSection(TOKEN, []), '');
  });

  it('in the follow-up cycle with an empty batch it says nothing was verified and forbids collecting', () => {
    const section = buildVerificationResultsSection(TOKEN, [], true);
    assert.match(section, /VERIFICATION RESULTS/);
    assert.match(section, /no file of this turn was verified/);
    assert.match(section, /may not collect/);
    assert.doesNotMatch(section, /\[document id:/);
  });

  it('with results, the follow-up flag changes nothing', () => {
    assert.equal(buildVerificationResultsSection(TOKEN, [result({})], true), buildVerificationResultsSection(TOKEN, [result({})]));
  });

  it('names the document, the file of this turn and the approved verdict', () => {
    const section = buildVerificationResultsSection(TOKEN, [result({})]);
    assert.match(section, /VERIFICATION RESULTS/);
    assert.match(section, /\[document id: doc-1\] אישור יתרות בנק דיסקונט/);
    assert.match(section, /file just received: \[file_id: file-1\] whatsapp-media-1\.pdf/);
    assert.match(section, /result: APPROVED/);
  });

  it('a rejected file carries its reasons and is said not to count as received', () => {
    const section = buildVerificationResultsSection(TOKEN, [
      result({ outcome: 'reopened', reasons: ['השם במסמך אינו תואם לשם הלקוח', 'התאריך אינו 31.12.2025'] }),
    ]);
    assert.match(section, /result: REJECTED: השם במסמך אינו תואם לשם הלקוח; התאריך אינו 31\.12\.2025/);
    assert.match(section, /does NOT count as received/);
  });

  it('a stalled file is handed to the office', () => {
    assert.match(buildVerificationResultsSection(TOKEN, [result({ outcome: 'stalled' })]), /result: HANDED TO THE OFFICE/);
  });

  it('a skipped or failed verification is "not verified yet", never approved or rejected', () => {
    for (const outcome of ['skipped', 'error'] as const) {
      const section = buildVerificationResultsSection(TOKEN, [result({ outcome })]);
      assert.match(section, /result: NOT VERIFIED YET/);
      assert.doesNotMatch(section, /result: (APPROVED|REJECTED)/);
    }
  });

  it('keeps one line per document and sanitizes names and reasons to one line', () => {
    const section = buildVerificationResultsSection(TOKEN, [
      result({ documentName: 'שורה\nשבורה', outcome: 'reopened', reasons: ['סיבה\nעם שבירה'] }),
      result({ documentId: 'doc-2', fileId: 'file-2' }),
    ]);
    const lines = section.split('\n').filter((l) => l.startsWith('[document id:'));
    assert.equal(lines.length, 2);
  });

  it('sits before the message thread in the built prompt, and is absent without results', () => {
    const client = {
      id: 'c1',
      name: 'ישראל ישראלי',
      email_address: 'wa-972500000002@wa.invalid',
      phone: null,
      wa_phone: '+972500000002',
      agent_fields: {},
      created_at: new Date('2026-09-01T00:00:00Z'),
    } as unknown as ClientRow;
    const now = new Date('2026-09-19T10:00:00Z');
    const withResults = buildPrompt(client, null, [], [], [], now, undefined, [], 2025, undefined, [], [result({})]).contents;
    assert.ok(withResults.indexOf('VERIFICATION RESULTS') > -1);
    assert.ok(withResults.indexOf('VERIFICATION RESULTS') < withResults.indexOf('MESSAGE THREAD'));
    const without = buildPrompt(client, null, [], [], [], now, undefined, [], 2025).contents;
    assert.equal(without.includes('VERIFICATION RESULTS'), false);
  });
});
