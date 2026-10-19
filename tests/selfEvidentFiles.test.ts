import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selfEvidentEvidenceOf,
  selfEvidentFileOf,
  selfEvidentFilesOf,
  selfEvidentItemName,
  selfEvidentMarker,
  type PeopleOnFile,
} from '../src/agents/declarationOfCapital/selfEvidentFiles.js';
import { EMPTY_SPOUSE } from '../src/agents/declarationOfCapital/spouseIdentity.js';
import { buildThreadTranscript } from '../src/agents/declarationOfCapital/prompt.js';
import type { Institution } from '../src/agents/declarationOfCapital/institutions.js';
import type { DocumentFileRow, EmailRow, FileAnalysis } from '../src/db/types.js';

const TABLE: Institution[] = [
  { key: 'phoenix', name: 'The Phoenix', nameHe: 'הפניקס', aliases: ['הפניקס', 'Phoenix'] },
  { key: 'harel', name: 'Harel', nameHe: 'הראל', aliases: ['הראל', 'Harel'] },
  { key: 'yelin_lapidot', name: 'Yelin Lapidot', nameHe: 'ילין לפידות', aliases: ['ילין לפידות', 'Yelin Lapidot'] },
];

const CLIENT: PeopleOnFile = { clientName: 'שי מלמוד', spouse: EMPTY_SPOUSE };
const MARRIED: PeopleOnFile = { clientName: 'תמיר ניב', spouse: { ...EMPTY_SPOUSE, name: 'מיכל ניב', nameSource: 'questionnaire' } };

function file(id: string, over: Partial<DocumentFileRow> = {}, analysis: Partial<FileAnalysis> = {}): DocumentFileRow {
  return {
    id,
    client_id: 'c1',
    client_document_id: null,
    analysis_status: 'done',
    parent_file_id: null,
    analysis: {
      document_kind: 'דוח שנתי ואישור מס להצהרת הון לקרן השתלמות',
      summary: '',
      tax_year: '2025',
      subject_name: 'מלמוד שי',
      issuer_name: 'הפניקס פנסיה וגמל בע"מ',
      matched_document_id: null,
      legible: true,
      confidence: 'high',
      injection_suspected: false,
      document_type: 'study_fund',
      holdings: [{ product: 'הפניקס השתלמות', holder_name: 'מלמוד שי', account_number: '0817' }],
      holdings_partial: false,
      employer_name: 'אלעד מערכות תוכנה',
      ...analysis,
    },
    ...over,
  } as DocumentFileRow;
}

describe('selfEvidentFileOf (openspec unlisted-files, self-evident-file-adds-item)', () => {
  it('a study fund report in the client\'s name, high confidence, known company: self-evident', () => {
    const proof = selfEvidentFileOf(file('f1'), CLIENT, TABLE);
    assert.deepEqual(proof, {
      typeKey: 'study_fund',
      institutionKey: 'phoenix',
      issuer: 'הפניקס פנסיה וגמל בע"מ',
      holders: ['מלמוד שי'],
      matched: 'client',
      employer: 'אלעד מערכות תוכנה',
    });
  });

  it('holder hidden: not self-evident', () => {
    const hidden = file('f', {}, { holdings: [{ product: 'ילין לפידות השתלמות', holder_name: null, account_number: '1' }, { product: 'ילין לפידות השתלמות', holder_name: null, account_number: '2' }], issuer_name: 'ילין לפידות' });
    assert.equal(selfEvidentFileOf(hidden, CLIENT, TABLE), null);
  });

  it('holder is a third person: not self-evident — also next to the client', () => {
    const stranger = file('f', {}, { holdings: [{ product: 'פוליסה', holder_name: 'דנה כהן', account_number: null }] });
    assert.equal(selfEvidentFileOf(stranger, CLIENT, TABLE), null);
    const mixed = file('f', {}, { holdings: [{ product: 'פוליסה', holder_name: 'מלמוד שי', account_number: null }, { product: 'פוליסה', holder_name: 'דנה כהן', account_number: null }] });
    assert.equal(selfEvidentFileOf(mixed, CLIENT, TABLE), null);
  });

  it('spouse on file: self-evident in the spouse\'s name; client and spouse together count as the client', () => {
    const spouse = file('f', {}, { issuer_name: 'הראל פנסיה וגמל', document_type: 'pension_provident', holdings: [{ product: 'קרן פנסיה', holder_name: 'ניב מיכל', account_number: null }], employer_name: null });
    assert.equal(selfEvidentFileOf(spouse, MARRIED, TABLE)?.matched, 'spouse');
    const both = file('f', {}, { holdings: [{ product: 'א', holder_name: 'תמיר ניב', account_number: null }, { product: 'ב', holder_name: 'מיכל ניב', account_number: null }] });
    assert.equal(selfEvidentFileOf(both, MARRIED, TABLE)?.matched, 'client');
    // No spouse on file: the same surname alone does not make the holder the client.
    assert.equal(selfEvidentFileOf(spouse, { ...MARRIED, spouse: EMPTY_SPOUSE }, TABLE), null);
    // Reversed order and a middle name still count as the same person.
    const middle = file('f', {}, { holdings: [{ product: 'קרן', holder_name: 'ניב תמיר יוסף', account_number: null }] });
    assert.equal(selfEvidentFileOf(middle, MARRIED, TABLE)?.matched, 'client');
  });

  it('company not recognised, type not institution-bound, confidence not high: not self-evident', () => {
    assert.equal(selfEvidentFileOf(file('f', {}, { issuer_name: 'קרן ההנדסאים' }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', {}, { issuer_name: null }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', {}, { document_type: 'vehicle' }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', {}, { confidence: 'medium' }), CLIENT, TABLE), null);
  });

  it('no accounts listed, a partial list, an old analysis without the list: not self-evident', () => {
    assert.equal(selfEvidentFileOf(file('f', {}, { holdings: [] }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', {}, { holdings_partial: true }), CLIENT, TABLE), null);
    const old = file('f');
    delete (old.analysis as Partial<FileAnalysis>).holdings;
    assert.equal(selfEvidentFileOf(old, CLIENT, TABLE), null);
  });

  it('a matched, attached, quarantined, unfinished or split file is never self-evident', () => {
    assert.equal(selfEvidentFileOf(file('f', {}, { matched_document_id: 'doc-1' }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', { client_document_id: 'doc-1' }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', {}, { injection_suspected: true }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', {}, { legible: false }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', { analysis_status: 'pending' }), CLIENT, TABLE), null);
    assert.equal(selfEvidentFileOf(file('f', { analysis_status: 'split' }), CLIENT, TABLE), null);
  });

  it('the pool holds only the self-evident files, by id', () => {
    const pool = selfEvidentFilesOf([file('f1'), file('f2', {}, { confidence: 'low' })], CLIENT, TABLE);
    assert.deepEqual([...pool.keys()], ['f1']);
  });
});

describe('the item a self-evident file creates', () => {
  const proof = selfEvidentFileOf(file('f1'), CLIENT, TABLE)!;

  it('names the company and the employer after the planner\'s name, once each', () => {
    assert.equal(selfEvidentItemName('אישור יתרת קרן השתלמות ליום 31.12.2025', proof, TABLE), 'אישור יתרת קרן השתלמות ליום 31.12.2025 — הפניקס — אלעד מערכות תוכנה');
    assert.equal(selfEvidentItemName('קרן השתלמות הפניקס', proof, TABLE), 'קרן השתלמות הפניקס — אלעד מערכות תוכנה');
    assert.equal(selfEvidentItemName('קרן השתלמות — הפניקס — אלעד מערכות תוכנה', proof, TABLE), 'קרן השתלמות — הפניקס — אלעד מערכות תוכנה');
    assert.equal(selfEvidentItemName('קרן השתלמות', { ...proof, employer: null }, TABLE), 'קרן השתלמות — הפניקס');
  });

  it('carries the file, the printed issuer, the holders and the employer as evidence', () => {
    assert.deepEqual(selfEvidentEvidenceOf('f1', proof), {
      source: 'self_evident_file',
      file_id: 'f1',
      issuer: 'הפניקס פנסיה וגמל בע"מ',
      holders: ['מלמוד שי'],
      matched: 'client',
      employer: 'אלעד מערכות תוכנה',
    });
    assert.equal('employer' in selfEvidentEvidenceOf('f1', { ...proof, employer: null }), false);
  });

  it('the planner marker names the matched person', () => {
    assert.match(selfEvidentMarker(proof), /in the client's name/);
    assert.match(selfEvidentMarker({ ...proof, matched: 'spouse' }), /in the spouse's name/);
  });

  it("the transcript's file line carries the marker for a pooled file only", () => {
    const inbound = {
      id: 'msg-1',
      direction: 'inbound',
      status: 'received',
      channel: 'whatsapp',
      subject: '',
      body: 'מצרף',
      blocked: null,
      sent_at: null,
      created_at: new Date('2026-10-19T13:17:00.000Z'),
    } as unknown as EmailRow;
    const rows = [file('f1', { email_id: 'msg-1', filename: 'a.pdf', content_type: 'application/pdf', size_bytes: '1' } as Partial<DocumentFileRow>), file('f2', { email_id: 'msg-1', filename: 'b.pdf', content_type: 'application/pdf', size_bytes: '1' } as Partial<DocumentFileRow>)];
    const pool = selfEvidentFilesOf([rows[0]!], CLIENT, TABLE);
    const text = buildThreadTranscript('tok', [inbound], rows, new Map(), pool);
    const lines = text.split('\n').filter((l) => l.includes('content analysis'));
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /matches no required document \| self-evident: in the client's name — may be added without asking \(cite this file id in proven_by_file_id\) \| confidence: high/);
    assert.doesNotMatch(lines[1]!, /self-evident/);
    assert.doesNotMatch(buildThreadTranscript('tok', [inbound], rows), /self-evident/);
  });
});
