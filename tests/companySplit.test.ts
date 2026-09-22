import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planCompanySplit } from '../src/agents/declarationOfCapital/companySplit.js';
import { companySuffixedName } from '../src/agents/declarationOfCapital/splitChildNames.js';
import type { Institution } from '../src/agents/declarationOfCapital/institutions.js';
import type { DocumentFileRow, FileAnalysis } from '../src/db/types.js';

const TABLE: Institution[] = [
  { key: 'harel', name: 'Harel', nameHe: 'הראל', aliases: ['הראל', 'Harel'] },
  { key: 'clal', name: 'Clal', nameHe: 'כלל', aliases: ['כלל', 'Clal'] },
  { key: 'migdal', name: 'Migdal', nameHe: 'מגדל', aliases: ['מגדל', 'Migdal'] },
  { key: 'meitav', name: 'Meitav', nameHe: 'מיטב', aliases: ['מיטב', 'Meitav'] },
  { key: 'mor', name: 'More', nameHe: 'מור', aliases: ['מור', 'More'] },
];

function file(id: string, issuer: string | null, analysis: Partial<FileAnalysis> = {}): DocumentFileRow {
  return {
    id,
    client_id: 'c1',
    client_document_id: null,
    analysis_status: 'done',
    parent_file_id: 'parent',
    analysis: {
      document_kind: 'אישור להצהרת הון',
      summary: '',
      tax_year: '2025',
      subject_name: 'ניב',
      issuer_name: issuer,
      matched_document_id: null,
      legible: true,
      confidence: 'high',
      injection_suspected: false,
      document_type: 'life_insurance_savings',
      ...analysis,
    },
  } as DocumentFileRow;
}

const insurance = { id: 'd-ins', name: 'ביטוח מנהלים ניב', type_key: 'life_insurance_savings' };
const studyFund = { id: 'd-sf', name: 'קרן השתלמות ניב', type_key: 'study_fund' };
const meitavFund = { id: 'd-meitav', name: 'קרן השתלמות — מיטב', type_key: 'study_fund' };
const vehicle = { id: 'd-car', name: 'מסמכי כלי רכב', type_key: 'vehicle' };
const DOCS = [insurance, studyFund, meitavFund, vehicle];

const files = new Map<string, DocumentFileRow>(
  [
    file('f-harel', 'הראל חברה לביטוח'),
    file('f-clal', 'כלל חברה לביטוח בע"מ'),
    file('f-migdal', 'מגדל חברה לביטוח בע"מ'),
    file('f-meitav-1', 'מיטב גמל ופנסיה בע"מ', { document_type: 'study_fund' }),
    file('f-meitav-2', 'Meitav Gemel', { document_type: 'study_fund' }),
    file('f-meitav-3', 'מיטב', { document_type: 'study_fund' }),
    file('f-mor', 'מור גמל ופנסיה בע"מ', { document_type: 'study_fund' }),
    file('f-unknown', 'קופה קטנה בע"מ', { document_type: 'study_fund' }),
    file('f-car', null, { document_type: 'vehicle' }),
  ].map((f) => [f.id, f]),
);

const pair = (file_id: string, document_id: string) => ({ file_id, document_id, evidence: null });

describe('planCompanySplit', () => {
  it('three companies for one item: one rename and two created rows, pairs redirected', () => {
    const pairs = [pair('f-harel', 'd-ins'), pair('f-clal', 'd-ins'), pair('f-migdal', 'd-ins')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.renames, [{ documentId: 'd-ins', oldName: 'ביטוח מנהלים ניב', newName: 'ביטוח מנהלים ניב — הראל' }]);
    assert.deepEqual(plan.created, [
      {
        fromDocumentId: 'd-ins',
        name: 'ביטוח מנהלים ניב — כלל',
        companyKey: 'clal',
        fileIds: ['f-clal'],
        evidence: { source: 'file', file_id: 'f-clal', issuer: 'כלל חברה לביטוח בע"מ' },
      },
      {
        fromDocumentId: 'd-ins',
        name: 'ביטוח מנהלים ניב — מגדל',
        companyKey: 'migdal',
        fileIds: ['f-migdal'],
        evidence: { source: 'file', file_id: 'f-migdal', issuer: 'מגדל חברה לביטוח בע"מ' },
      },
    ]);
    assert.deepEqual(plan.pairs, [pairs[0]]);
    // The names are the same strings the child labels get.
    assert.equal(plan.renames[0]!.newName, companySuffixedName(insurance.name, 'הראל חברה לביטוח', insurance.type_key, TABLE));
    assert.equal(plan.created[0]!.name, companySuffixedName(insurance.name, 'כלל חברה לביטוח בע"מ', insurance.type_key, TABLE));
  });

  it('several files of one company share one row; one further company gets one row', () => {
    const pairs = [pair('f-meitav-1', 'd-sf'), pair('f-mor', 'd-sf'), pair('f-meitav-2', 'd-sf'), pair('f-meitav-3', 'd-sf')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.renames, [{ documentId: 'd-sf', oldName: 'קרן השתלמות ניב', newName: 'קרן השתלמות ניב — מיטב' }]);
    assert.equal(plan.created.length, 1);
    assert.equal(plan.created[0]!.name, 'קרן השתלמות ניב — מור');
    assert.deepEqual(plan.created[0]!.fileIds, ['f-mor']);
    assert.deepEqual(plan.pairs.map((p) => p.file_id), ['f-meitav-1', 'f-meitav-2', 'f-meitav-3']);
  });

  it('one company: rename only, the pair stays', () => {
    const pairs = [pair('f-harel', 'd-sf')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.renames, [{ documentId: 'd-sf', oldName: 'קרן השתלמות ניב', newName: 'קרן השתלמות ניב — הראל' }]);
    assert.deepEqual(plan.created, []);
    assert.deepEqual(plan.pairs, pairs);
  });

  it('an unrecognised company changes nothing and stays on the head, also next to a recognised one', () => {
    const alone = planCompanySplit([pair('f-unknown', 'd-sf')], files, DOCS, TABLE);
    assert.deepEqual(alone, { renames: [], created: [], pairs: [pair('f-unknown', 'd-sf')] });
    const pairs = [pair('f-unknown', 'd-sf'), pair('f-harel', 'd-sf')];
    const mixed = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.equal(mixed.renames[0]!.newName, 'קרן השתלמות ניב — הראל');
    assert.deepEqual(mixed.created, []);
    assert.deepEqual(mixed.pairs, pairs);
  });

  it('leaves an item that names a company, a non-institution item and an unknown item alone', () => {
    const pairs = [pair('f-harel', 'd-meitav'), pair('f-car', 'd-car'), pair('f-clal', 'd-gone')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan, { renames: [], created: [], pairs });
  });

  it('keeps pairs to other items in place while splitting one', () => {
    const pairs = [pair('f-car', 'd-car'), pair('f-harel', 'd-ins'), pair('f-clal', 'd-ins'), pair('f-mor', 'd-sf')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.pairs.map((p) => p.file_id), ['f-car', 'f-harel', 'f-mor']);
    assert.deepEqual(plan.renames.map((r) => r.documentId), ['d-ins', 'd-sf']);
    assert.deepEqual(plan.created.map((c) => c.name), ['ביטוח מנהלים ניב — כלל']);
  });
});
