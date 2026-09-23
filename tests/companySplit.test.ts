import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { employerBaseName, planCompanySplit } from '../src/agents/declarationOfCapital/companySplit.js';
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
const meitavNamed = { id: 'd-meitav-named', name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב', type_key: 'study_fund' };
const meitavEmployer = { id: 'd-meitav-e1', name: 'קרן השתלמות ניב — מיטב — פרייסמנס בע"מ', type_key: 'study_fund' };
const DOCS = [insurance, studyFund, meitavFund, vehicle, meitavNamed, meitavEmployer];

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
    // Three Meitav study fund reports of three employers, and one Meitav report of the first employer again.
    file('f-meitav-e1', 'מיטב גמל ופנסיה בע"מ', { document_type: 'study_fund', employer_name: 'פרייסמנס בע"מ' }),
    file('f-meitav-e2', 'מיטב גמל ופנסיה בע"מ', { document_type: 'study_fund', employer_name: 'גילת רשתות לווין בע"מ' }),
    file('f-meitav-e3', 'מיטב גמל ופנסיה בע"מ', { document_type: 'study_fund', employer_name: 'ראנדקום בע"מ' }),
    file('f-meitav-e1b', 'Meitav', { document_type: 'study_fund', employer_name: 'פרייסמנס  בע"מ' }),
    file('f-meitav-e4', 'מיטב', { document_type: 'study_fund', employer_name: 'טבע בע"מ' }),
    file('f-meitav-bad', 'מיטב', { document_type: 'study_fund', employer_name: 'א'.repeat(80) }),
    file('f-harel-e', 'הראל פנסיה וגמל', { document_type: 'study_fund', employer_name: 'אלביט מערכות בע"מ' }),
    file('f-unknown-e', 'קופה קטנה בע"מ', { document_type: 'study_fund', employer_name: 'אלביט מערכות בע"מ' }),
    file('f-clal-e1', 'כלל חברה לביטוח בע"מ', { employer_name: 'פרייסמנס בע"מ' }),
    file('f-clal-e2', 'כלל חברה לביטוח בע"מ', { employer_name: 'ראנדקום בע"מ' }),
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
        employer: null,
        fileIds: ['f-clal'],
        evidence: { source: 'file', file_id: 'f-clal', issuer: 'כלל חברה לביטוח בע"מ' },
      },
      {
        fromDocumentId: 'd-ins',
        name: 'ביטוח מנהלים ניב — מגדל',
        companyKey: 'migdal',
        employer: null,
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

describe('planCompanySplit — employer stage (openspec unlisted-files)', () => {
  const meitav = 'מיטב גמל ופנסיה בע"מ';

  it('three Meitav employers and one Mor file on an item that names no company', () => {
    const pairs = [pair('f-meitav-e1', 'd-sf'), pair('f-meitav-e2', 'd-sf'), pair('f-mor', 'd-sf'), pair('f-meitav-e3', 'd-sf')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.renames, [{ documentId: 'd-sf', oldName: 'קרן השתלמות ניב', newName: 'קרן השתלמות ניב — מיטב — פרייסמנס בע"מ' }]);
    assert.deepEqual(plan.created, [
      {
        fromDocumentId: 'd-sf',
        name: 'קרן השתלמות ניב — מיטב — גילת רשתות לווין בע"מ',
        companyKey: 'meitav',
        employer: 'גילת רשתות לווין בע"מ',
        fileIds: ['f-meitav-e2'],
        evidence: { source: 'file', file_id: 'f-meitav-e2', issuer: meitav, employer: 'גילת רשתות לווין בע"מ' },
      },
      {
        fromDocumentId: 'd-sf',
        name: 'קרן השתלמות ניב — מיטב — ראנדקום בע"מ',
        companyKey: 'meitav',
        employer: 'ראנדקום בע"מ',
        fileIds: ['f-meitav-e3'],
        evidence: { source: 'file', file_id: 'f-meitav-e3', issuer: meitav, employer: 'ראנדקום בע"מ' },
      },
      {
        fromDocumentId: 'd-sf',
        name: 'קרן השתלמות ניב — מור',
        companyKey: 'mor',
        employer: null,
        fileIds: ['f-mor'],
        evidence: { source: 'file', file_id: 'f-mor', issuer: 'מור גמל ופנסיה בע"מ' },
      },
    ]);
    assert.deepEqual(plan.pairs, [pairs[0]]);
  });

  it('an item that already names the company is divided by employer without a company stage', () => {
    const pairs = [pair('f-meitav-e1', 'd-meitav-named'), pair('f-meitav-e2', 'd-meitav-named'), pair('f-meitav-e3', 'd-meitav-named')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.renames, [{ documentId: 'd-meitav-named', oldName: meitavNamed.name, newName: `${meitavNamed.name} — פרייסמנס בע"מ` }]);
    assert.deepEqual(
      plan.created.map((c) => [c.name, c.companyKey, c.employer, c.fileIds]),
      [
        [`${meitavNamed.name} — גילת רשתות לווין בע"מ`, 'meitav', 'גילת רשתות לווין בע"מ', ['f-meitav-e2']],
        [`${meitavNamed.name} — ראנדקום בע"מ`, 'meitav', 'ראנדקום בע"מ', ['f-meitav-e3']],
      ],
    );
    assert.deepEqual(plan.pairs, [pairs[0]]);
  });

  it('files of one company that print no employer, or one that fails cleaning, stay together: company rename only', () => {
    const pairs = [pair('f-meitav-1', 'd-sf'), pair('f-meitav-2', 'd-sf'), pair('f-meitav-bad', 'd-sf')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.renames, [{ documentId: 'd-sf', oldName: 'קרן השתלמות ניב', newName: 'קרן השתלמות ניב — מיטב' }]);
    assert.deepEqual(plan.created, []);
    assert.deepEqual(plan.pairs, pairs);
  });

  it('files of the same employer share one row, spelled with different spacing', () => {
    const pairs = [pair('f-meitav-e1', 'd-sf'), pair('f-meitav-e1b', 'd-sf'), pair('f-meitav-e2', 'd-sf')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.equal(plan.renames[0]!.newName, 'קרן השתלמות ניב — מיטב — פרייסמנס בע"מ');
    assert.deepEqual(plan.created.map((c) => [c.name, c.fileIds]), [['קרן השתלמות ניב — מיטב — גילת רשתות לווין בע"מ', ['f-meitav-e2']]]);
    assert.deepEqual(plan.pairs, [pairs[0], pairs[1]]);
  });

  it('an item that already names an employer keeps that employer and gets a sibling for another, built on the name without the employer', () => {
    const pairs = [pair('f-meitav-e1', 'd-meitav-e1'), pair('f-meitav-e4', 'd-meitav-e1')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.renames, []);
    assert.deepEqual(plan.created.map((c) => [c.name, c.employer, c.fileIds]), [['קרן השתלמות ניב — מיטב — טבע בע"מ', 'טבע בע"מ', ['f-meitav-e4']]]);
    assert.deepEqual(plan.pairs, [pairs[0]]);
  });

  it('one file with an employer: rename only; an unrecognised company with an employer still gets the employer', () => {
    const one = planCompanySplit([pair('f-harel-e', 'd-sf')], files, DOCS, TABLE);
    assert.deepEqual(one.renames, [{ documentId: 'd-sf', oldName: 'קרן השתלמות ניב', newName: 'קרן השתלמות ניב — הראל — אלביט מערכות בע"מ' }]);
    assert.deepEqual(one.created, []);
    const unknown = planCompanySplit([pair('f-unknown-e', 'd-sf')], files, DOCS, TABLE);
    assert.deepEqual(unknown.renames, [{ documentId: 'd-sf', oldName: 'קרן השתלמות ניב', newName: 'קרן השתלמות ניב — אלביט מערכות בע"מ' }]);
    assert.deepEqual(unknown.created, []);
  });

  it('a company sibling is divided by employer too, and its evidence follows its employer file', () => {
    // Harel first (head), then two Meitav reports of two employers: the Meitav sibling takes the first employer and spawns one more row.
    const pairs = [pair('f-harel', 'd-sf'), pair('f-meitav-e1', 'd-sf'), pair('f-meitav-e2', 'd-sf')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.equal(plan.renames[0]!.newName, 'קרן השתלמות ניב — הראל');
    assert.deepEqual(
      plan.created.map((c) => [c.name, c.companyKey, c.employer, c.fileIds, c.evidence]),
      [
        [
          'קרן השתלמות ניב — מיטב — פרייסמנס בע"מ',
          'meitav',
          'פרייסמנס בע"מ',
          ['f-meitav-e1'],
          { source: 'file', file_id: 'f-meitav-e1', issuer: meitav, employer: 'פרייסמנס בע"מ' },
        ],
        [
          'קרן השתלמות ניב — מיטב — גילת רשתות לווין בע"מ',
          'meitav',
          'גילת רשתות לווין בע"מ',
          ['f-meitav-e2'],
          { source: 'file', file_id: 'f-meitav-e2', issuer: meitav, employer: 'גילת רשתות לווין בע"מ' },
        ],
      ],
    );
    assert.deepEqual(plan.pairs, [pairs[0]]);
  });

  it('never divides a type that is not employer-bound by employer', () => {
    const pairs = [pair('f-clal-e1', 'd-ins'), pair('f-clal-e2', 'd-ins')];
    const plan = planCompanySplit(pairs, files, DOCS, TABLE);
    assert.deepEqual(plan.renames, [{ documentId: 'd-ins', oldName: 'ביטוח מנהלים ניב', newName: 'ביטוח מנהלים ניב — כלל' }]);
    assert.deepEqual(plan.created, []);
    assert.deepEqual(plan.pairs, pairs);
  });

  it('employerBaseName drops the employer part after the company part only', () => {
    assert.equal(employerBaseName('קרן השתלמות ניב — מיטב — פרייסמנס בע"מ', TABLE), 'קרן השתלמות ניב — מיטב');
    assert.equal(employerBaseName('קרן השתלמות ניב — מיטב', TABLE), 'קרן השתלמות ניב — מיטב');
    assert.equal(employerBaseName('קרן השתלמות ניב', TABLE), 'קרן השתלמות ניב');
    assert.equal(employerBaseName('אישור יתרת קרן השתלמות ליום 31.12.2025 — מיכל', TABLE), 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מיכל');
  });
});
