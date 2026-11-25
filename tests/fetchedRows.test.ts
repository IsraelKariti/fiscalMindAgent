import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveFetchKeys, planFetchedRows } from '../src/agents/declarationOfCapital/documentFetch/fetchedRows.js';
import { getProviderSpec } from '../src/agents/declarationOfCapital/documentFetch/providers.js';
import type { FetchedDocument } from '../src/agents/declarationOfCapital/documentFetch/types.js';
import type { ClientDocumentRow, DocumentStatus } from '../src/db/types.js';

// A Phoenix fetch brings everything it finds; a kind the list lacks gets its
// own row at delivery (openspec `phoenix-fetch`).
const phoenix = getProviderSpec('phoenix');
const altshuler = getProviderSpec('altshuler_shaham');

const pdf = (kind: string, title: string): FetchedDocument => ({
  buffer: Buffer.from('%PDF-'),
  filename: `${title}.pdf`,
  contentType: 'application/pdf',
  title,
  kind,
});
const DOCS: FetchedDocument[] = [
  pdf('study_fund_annual', 'דוח שנתי מלא 2024'),
  pdf('study_fund_annual', 'דוח שנתי מקוצר ואישור מס 2024'),
  pdf('pension_annual', 'דוח מפורט לשנת 2024'),
];

let seq = 0;
const row = (name: string, typeKey: string | null, status: DocumentStatus): ClientDocumentRow => ({
  id: `row-${++seq}`,
  client_id: 'c1',
  name,
  description: null,
  status,
  type_key: typeKey,
  paper_key: null,
  verification: null,
  resolution_evidence: null,
  replaced_by: null,
  created_at: new Date(),
  updated_at: new Date(),
});
const PENSION_PHOENIX = () => row('אישור יתרות קופות גמל ופנסיה ליום 31.12.2024 — הפניקס', 'pension_provident', 'pending');
const STUDY_OPEN = () => row('אישור יתרת קרן השתלמות ליום 31.12.2024', 'study_fund', 'unresolved');

describe('planFetchedRows', () => {
  it('study fund found that was not on the list: the open catalog row is settled with the Phoenix name', () => {
    const study = STUDY_OPEN();
    const plans = planFetchedRows(phoenix, DOCS, [PENSION_PHOENIX(), study], 2024);
    assert.equal(plans.length, 1);
    const plan = plans[0]!;
    assert.equal(plan.kind, 'study_fund_annual');
    assert.equal(plan.action, 'resolve');
    assert.equal(plan.targetRowId, study.id);
    assert.equal(plan.name, 'אישור יתרת קרן השתלמות ליום 31.12.2024 — הפניקס');
    assert.ok(plan.description.includes('31.12.2024'));
    assert.deepEqual(plan.docIndexes, [0, 1]);
  });

  it('study fund settled as not needed from the questionnaire: reopened as needed', () => {
    const study = row('אישור יתרת קרן השתלמות ליום 31.12.2024', 'study_fund', 'not_required');
    const plans = planFetchedRows(phoenix, DOCS, [PENSION_PHOENIX(), study], 2024);
    assert.deepEqual(plans.map((p) => [p.action, p.targetRowId]), [['resolve', study.id]]);
  });

  it('study fund of another company already on the list: a sibling is added next to it', () => {
    const altshulerRow = row('קרן השתלמות — אלטשולר שחם', 'study_fund', 'pending');
    const plans = planFetchedRows(phoenix, DOCS, [PENSION_PHOENIX(), altshulerRow], 2024);
    assert.deepEqual(plans.map((p) => [p.action, p.targetRowId, p.name]), [
      ['add', altshulerRow.id, 'אישור יתרת קרן השתלמות ליום 31.12.2024 — הפניקס'],
    ]);
  });

  it('Phoenix row already exists: nothing is created', () => {
    const existing = row('אישור יתרת קרן השתלמות ליום 31.12.2024 — הפניקס', 'study_fund', 'pending');
    assert.deepEqual(planFetchedRows(phoenix, DOCS, [PENSION_PHOENIX(), existing], 2024), []);
    const approved = row('קרן השתלמות — הפניקס', 'study_fund', 'approved');
    assert.deepEqual(planFetchedRows(phoenix, DOCS, [PENSION_PHOENIX(), approved], 2024), []);
  });

  it('a retired Phoenix row does not count as existing', () => {
    const retired = row('קרן השתלמות — הפניקס', 'study_fund', 'retired');
    const open = STUDY_OPEN();
    const plans = planFetchedRows(phoenix, DOCS, [PENSION_PHOENIX(), retired, open], 2024);
    assert.deepEqual(plans.map((p) => [p.action, p.targetRowId]), [['resolve', open.id]]);
  });

  it('nothing extra found: no plan', () => {
    const onlyPension = DOCS.filter((d) => d.kind === 'pension_annual');
    assert.deepEqual(planFetchedRows(phoenix, onlyPension, [PENSION_PHOENIX(), STUDY_OPEN()], 2024), []);
  });

  it('both kinds missing: one plan per kind', () => {
    const pensionOpen = row('אישור יתרות קופות גמל ופנסיה ליום 31.12.2024', 'pension_provident', 'unresolved');
    const plans = planFetchedRows(phoenix, DOCS, [pensionOpen, STUDY_OPEN()], 2024);
    assert.deepEqual(plans.map((p) => [p.kind, p.action]), [
      ['pension_annual', 'resolve'],
      ['study_fund_annual', 'resolve'],
    ]);
    assert.equal(plans[0]!.name, 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2024 — הפניקס');
  });

  it('no row of the type at all (ad-hoc list): nothing is created', () => {
    assert.deepEqual(planFetchedRows(phoenix, DOCS, [PENSION_PHOENIX()], 2024), []);
  });

  it('a per-document-consent provider never creates rows', () => {
    assert.deepEqual(planFetchedRows(altshuler, DOCS, [STUDY_OPEN()], 2024), []);
  });
});

describe('effectiveFetchKeys', () => {
  it('Phoenix always covers both kinds, whatever is pending or agreed', () => {
    assert.deepEqual(effectiveFetchKeys(['pension_annual'], ['pension_annual'], phoenix), ['pension_annual', 'study_fund_annual']);
    assert.deepEqual(effectiveFetchKeys(null, ['study_fund_annual'], phoenix), ['pension_annual', 'study_fund_annual']);
  });

  it('Altshuler keeps per-document consent within the pending set', () => {
    assert.deepEqual(effectiveFetchKeys(['pension_annual'], ['pension_annual', 'study_fund_annual'], altshuler), ['pension_annual']);
    assert.deepEqual(effectiveFetchKeys(null, ['study_fund_annual'], altshuler), ['study_fund_annual']);
    assert.deepEqual(effectiveFetchKeys(['study_fund_annual'], ['pension_annual'], altshuler), ['pension_annual']);
  });
});

describe('phoenix confirmation names the kinds added to the list', () => {
  it('adds one sentence per created kind', () => {
    const text = phoenix.delivery.waConfirmation(DOCS, true, ['study_fund_annual']);
    assert.match(text, /מצאתי שם גם את קרן ההשתלמות שלך — הוספתי אותה לרשימת המסמכים\./);
    assert.doesNotMatch(phoenix.delivery.waConfirmation(DOCS, true, []), /מצאתי שם גם/);
    assert.doesNotMatch(phoenix.delivery.waConfirmation(DOCS, true), /מצאתי שם גם/);
  });
});

// Harel brings everything it finds too (openspec `harel-fetch`): the same
// planner, keyed on the provider flag, names the row "— הראל".
describe('harel fetched rows and wording', () => {
  const harel = getProviderSpec('harel');
  const HAREL_DOCS: FetchedDocument[] = [
    pdf('study_fund_annual', 'דוח תקופתי מקוצר — חשבון 111'),
    pdf('study_fund_annual', 'אישור מס דוח שנתי מקוצר — חשבון 222'),
    pdf('pension_annual', 'דוח שנתי — חשבון 333'),
  ];

  it('pension found with no Harel pension row: the open catalog row is settled with the Harel name', () => {
    const studyHarel = row('אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל', 'study_fund', 'pending');
    const pensionOpen = row('אישור יתרות קופות גמל ופנסיה ליום 31.12.2025', 'pension_provident', 'unresolved');
    const plans = planFetchedRows(harel, HAREL_DOCS, [studyHarel, pensionOpen], 2025);
    assert.deepEqual(plans.map((p) => [p.kind, p.action, p.targetRowId, p.name, p.docIndexes]), [
      ['pension_annual', 'resolve', pensionOpen.id, 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — הראל', [2]],
    ]);
  });

  it('Harel pension row already exists: nothing is created', () => {
    const studyHarel = row('אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל', 'study_fund', 'pending');
    const pensionHarel = row('אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — הראל', 'pension_provident', 'pending');
    assert.deepEqual(planFetchedRows(harel, HAREL_DOCS, [studyHarel, pensionHarel], 2025), []);
  });

  it('Harel always covers both kinds', () => {
    assert.deepEqual(effectiveFetchKeys(['study_fund_annual'], ['study_fund_annual'], harel), ['pension_annual', 'study_fund_annual']);
  });

  it('the Harel name match tells pension from study fund', () => {
    const [pension, study] = harel.documents;
    assert.equal(pension!.matchesRequiredDocument({ name: 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — הראל' }), true);
    assert.equal(pension!.matchesRequiredDocument({ name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל' }), false);
    assert.equal(study!.matchesRequiredDocument({ name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל' }), true);
    assert.equal(study!.matchesRequiredDocument({ name: 'קרן השתלמות — הפניקס' }), false);
  });

  it('wording names the products fetched and the kinds added', () => {
    const both = harel.delivery.waConfirmation(HAREL_DOCS, true, ['pension_annual']);
    assert.match(both, /3 דוחות שנתיים של קרן ההשתלמות והפנסיה שלך מהראל/);
    assert.match(both, /מצאתי שם גם את הפנסיה שלך — הוספתי אותה לרשימת המסמכים\./);
    const studyOnly = HAREL_DOCS.filter((d) => d.kind === 'study_fund_annual');
    assert.match(harel.delivery.waConfirmation(studyOnly, false), /2 דוחות שנתיים של קרן ההשתלמות שלך מהראל/);
    assert.doesNotMatch(harel.delivery.waConfirmation(studyOnly, false), /מצאתי שם גם/);
    assert.equal(harel.delivery.emailSubject(HAREL_DOCS, 2025), 'דוחות שנתיים קרן ההשתלמות והפנסיה - הראל - 2025');
    assert.equal(harel.delivery.fileLabel(HAREL_DOCS[2]!, 2025), 'דוח שנתי — חשבון 333 — הראל 2025');
  });
});
