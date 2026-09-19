import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignFilesToNewRows, companyRefusal, filterPairsByCompany } from '../src/agents/declarationOfCapital/fileTies.js';
import type { Institution } from '../src/agents/declarationOfCapital/institutions.js';
import type { DocumentFileRow, FileAnalysis } from '../src/db/types.js';

const TABLE: Institution[] = [
  { key: 'altshuler_shaham', name: 'Altshuler Shaham', aliases: ['אלטשולר שחם', 'Altshuler Shaham'] },
  { key: 'harel', name: 'Harel', aliases: ['הראל', 'Harel'] },
];

function file(id: string, over: Partial<DocumentFileRow> = {}, analysis: Partial<FileAnalysis> = {}): DocumentFileRow {
  return {
    id,
    client_id: 'c1',
    client_document_id: null,
    analysis_status: 'done',
    parent_file_id: null,
    analysis: {
      document_kind: 'אישור מס להצהרת הון',
      summary: '',
      tax_year: '2025',
      subject_name: 'ישראל ישראלי',
      issuer_name: 'Harel Pension & Gemel',
      matched_document_id: null,
      legible: true,
      confidence: 'high',
      injection_suspected: false,
      document_type: 'study_fund',
      ...analysis,
    },
    ...over,
  } as DocumentFileRow;
}

const altshuler = { id: 'd-alt', name: 'אישור להצהרת הון — קרן השתלמות באלטשולר שחם', type_key: 'study_fund' };
const harel = { id: 'd-harel', name: 'אישור להצהרת הון — קרן השתלמות בהראל', type_key: 'study_fund' };
const smallFund = { id: 'd-small', name: 'קרן השתלמות של ההנדסאים', type_key: 'study_fund' };
const vehicle = { id: 'd-car', name: 'רישיון רכב — טויוטה', type_key: 'vehicle' };

describe('companyRefusal', () => {
  it('lets a tie through when the type is not institution-bound', () => {
    assert.equal(companyRefusal(file('f', {}, { issuer_name: null }), vehicle, false, TABLE), null);
  });

  it('lets the same company through, in either language', () => {
    assert.equal(companyRefusal(file('f'), harel, false, TABLE), null);
    assert.equal(companyRefusal(file('f', {}, { issuer_name: 'הראל פנסיה וגמל בע"מ' }), harel, false, TABLE), null);
  });

  it('refuses two identified, different companies — also with the client\'s words', () => {
    assert.equal(companyRefusal(file('f'), altshuler, false, TABLE), 'companies_differ');
    assert.equal(companyRefusal(file('f'), altshuler, true, TABLE), 'companies_differ');
  });

  it('an unidentified company needs the client\'s quoted words', () => {
    const unknownIssuer = file('f', {}, { issuer_name: 'קרן ההנדסאים' });
    assert.equal(companyRefusal(unknownIssuer, smallFund, false, TABLE), 'company_unidentified_no_client_quote');
    assert.equal(companyRefusal(unknownIssuer, smallFund, true, TABLE), null);
    // The item names no known company.
    assert.equal(companyRefusal(file('f'), smallFund, false, TABLE), 'company_unidentified_no_client_quote');
    // A file analysed before issuer_name existed.
    const { issuer_name: _omit, ...old } = file('f').analysis!;
    assert.equal(companyRefusal(file('f', { analysis: old as FileAnalysis }), harel, false, TABLE), 'company_unidentified_no_client_quote');
  });
});

describe('filterPairsByCompany', () => {
  it('splits the planner\'s pairs into allowed and refused', () => {
    const files = new Map([['f1', file('f1')]]);
    const quote = { message_id: 'm', quote: 'q' };
    const result = filterPairsByCompany(
      [
        { file_id: 'f1', document_id: 'd-harel', evidence: null },
        { file_id: 'f1', document_id: 'd-alt', evidence: quote },
        { file_id: 'f1', document_id: 'd-small', evidence: null },
        { file_id: 'f1', document_id: 'd-small', evidence: quote },
        { file_id: 'f1', document_id: 'd-car', evidence: null },
      ],
      files,
      [altshuler, harel, smallFund, vehicle],
      TABLE,
    );
    assert.deepEqual(result.allowed.map((p) => `${p.document_id}:${p.evidence !== null}`), ['d-harel:false', 'd-small:true', 'd-car:false']);
    assert.deepEqual(result.refused, [
      { file_id: 'f1', document_id: 'd-alt', reason: 'companies_differ' },
      { file_id: 'f1', document_id: 'd-small', reason: 'company_unidentified_no_client_quote' },
    ]);
  });
});

describe('assignFilesToNewRows', () => {
  const row = (id: string, over: Partial<{ name: string; type_key: string | null; status: string }> = {}) =>
    ({ id, name: harel.name, type_key: 'study_fund', status: 'pending', ...over }) as never;

  it('attaches a waiting file of the same type and company to the new row', () => {
    const result = assignFilesToNewRows([{ row: row('new-1'), fileIds: ['f1'] }], new Map([['f1', file('f1')]]), TABLE);
    assert.deepEqual(result, { pairs: [{ file_id: 'f1', document_id: 'new-1' }], refused: [] });
  });

  it('the row\'s own evidence covers an unidentified company, never two different ones', () => {
    const files = new Map([['f1', file('f1')]]);
    assert.equal(assignFilesToNewRows([{ row: row('n', { name: smallFund.name }), fileIds: ['f1'] }], files, TABLE).pairs.length, 1);
    assert.deepEqual(assignFilesToNewRows([{ row: row('n', { name: altshuler.name }), fileIds: ['f1'] }], files, TABLE).refused, [
      { file_id: 'f1', document_id: 'n', reason: 'companies_differ' },
    ]);
  });

  it('refuses each unfit file with its reason, and the row is then simply created as waiting', () => {
    const files = new Map<string, DocumentFileRow>([
      ['split', file('split', { analysis_status: 'split', analysis: null })],
      ['blurry', file('blurry', {}, { legible: false })],
      ['injected', file('injected', {}, { injection_suspected: true })],
      ['pending', file('pending', { analysis_status: 'pending', analysis: null })],
      ['attached', file('attached', { client_document_id: 'other' })],
      ['bank', file('bank', {}, { document_type: 'bank_balance' })],
    ]);
    const reasonFor = (fileId: string) =>
      assignFilesToNewRows([{ row: row('n'), fileIds: [fileId] }], files, TABLE).refused.map((r) => r.reason);
    assert.deepEqual(reasonFor('missing'), ['unknown_file']);
    assert.deepEqual(reasonFor('split'), ['split_parent']);
    assert.deepEqual(reasonFor('blurry'), ['not_verified_legible']);
    assert.deepEqual(reasonFor('injected'), ['not_verified_legible']);
    assert.deepEqual(reasonFor('pending'), ['not_verified_legible']);
    assert.deepEqual(reasonFor('attached'), ['already_attached']);
    assert.deepEqual(reasonFor('bank'), ['type_differs']);
    assert.deepEqual(
      assignFilesToNewRows([{ row: row('n', { status: 'claimed' }), fileIds: ['attached'] }], files, TABLE).refused.map((r) => r.reason),
      ['row_not_pending'],
    );
  });

  it('one file goes to one row only: the first that names it', () => {
    const result = assignFilesToNewRows(
      [
        { row: row('new-1'), fileIds: ['f1'] },
        { row: row('new-2'), fileIds: ['f1'] },
      ],
      new Map([['f1', file('f1')]]),
      TABLE,
    );
    assert.deepEqual(result.pairs, [{ file_id: 'f1', document_id: 'new-1' }]);
    assert.deepEqual(result.refused, [{ file_id: 'f1', document_id: 'new-2', reason: 'file_already_taken' }]);
  });
});
