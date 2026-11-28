import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIGDAL_ROUNDS,
  chooseYearOption,
  classifyTaxCertificateProduct,
  isMigdalFormPost,
  listOutcomeOf,
  normalizeMigdalTitle,
  selectMigdalRows,
  shouldPressSubmit,
  titleCarriesYear,
  type MigdalRow,
} from '../src/browserRunner/migdal.js';
import { getProviderSpec } from '../src/agents/declarationOfCapital/documentFetch/providers.js';

// Migdal row selection (openspec `migdal-fetch`): the kind comes from the
// round, the title must carry the year, duplicates within a kind are taken
// once. Titles below are the owner's real rows as seen live 2026-11-24
// (note the site's double space in "מקפת  אישית").
const row = (index: number, title: string): MigdalRow => ({ index, title });

describe('migdal rounds', () => {
  it('runs both report types for pension and study fund, never health', () => {
    assert.deepEqual(
      MIGDAL_ROUNDS.map((r) => [r.typeLabel, r.productLabel, r.kind]),
      [
        ['דוח שנתי', 'פנסיה', 'pension_annual'],
        ['דוח שנתי', 'השתלמות', 'study_fund_annual'],
        ['דוח שנתי מקוצר', 'פנסיה', 'pension_annual'],
        ['דוח שנתי מקוצר', 'השתלמות', 'study_fund_annual'],
      ],
    );
    assert.ok(MIGDAL_ROUNDS.every((r) => r.productLabel !== 'בריאות'));
  });
});

describe('migdal row selection', () => {
  it('keeps the full and the short pension report of the year, tagged by the round', () => {
    const seen = new Set<string>();
    const full = selectMigdalRows([row(0, 'דוח שנתי לעמית- מקפת  אישית - לשנת 2024')], 2024, 'pension_annual', seen);
    const short = selectMigdalRows([row(0, 'דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024')], 2024, 'pension_annual', seen);
    assert.deepEqual(full, [{ index: 0, title: 'דוח שנתי לעמית- מקפת אישית - לשנת 2024', kind: 'pension_annual' }]);
    assert.deepEqual(short, [{ index: 0, title: 'דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024', kind: 'pension_annual' }]);
  });

  it('skips a title that does not carry the tax year', () => {
    const rows = [row(0, 'דוח שנתי - בריאות - לשנת 2020'), row(2, 'דוח שנתי לעמית- מקפת  אישית - לשנת 2016')];
    assert.deepEqual(
      selectMigdalRows(rows, 2016, 'pension_annual').map((r) => r.index),
      [2],
    );
    assert.equal(selectMigdalRows(rows, 2024, 'pension_annual').length, 0);
  });

  it('downloads the same title once within a kind, but keeps it for the other kind', () => {
    const seen = new Set<string>();
    const rows = [row(0, 'דוח שנתי לעמית - לשנת 2024'), row(2, 'דוח שנתי לעמית - לשנת 2024')];
    assert.equal(selectMigdalRows(rows, 2024, 'pension_annual', seen).length, 1);
    assert.equal(selectMigdalRows(rows, 2024, 'pension_annual', seen).length, 0);
    assert.equal(selectMigdalRows(rows, 2024, 'study_fund_annual', seen).length, 1);
  });

  it('normalizes the title whitespace and keeps the link index for the click', () => {
    assert.equal(normalizeMigdalTitle('  דוח שנתי לעמית- מקפת  אישית - לשנת 2016 '), 'דוח שנתי לעמית- מקפת אישית - לשנת 2016');
    const picked = selectMigdalRows([row(4, ' דוח שנתי לעמית- מקפת  אישית - לשנת 2016 ')], 2016, 'pension_annual');
    assert.deepEqual(picked, [{ index: 4, title: 'דוח שנתי לעמית- מקפת אישית - לשנת 2016', kind: 'pension_annual' }]);
  });
});

describe('migdal provider spec', () => {
  const spec = getProviderSpec('migdal');
  const type = (key: string) => spec.documents.find((d) => d.key === key)!;

  it('is an id-only SMS login that takes every document', () => {
    assert.equal(spec.siteNameHe, 'מגדל');
    assert.equal(spec.otpChannel, 'sms');
    assert.equal(spec.takesAllDocuments, true);
    assert.match(spec.messages.otpSent, /מגדל/);
    assert.match(spec.messages.otpSent, /הרשום/);
  });

  it('matches Migdal checklist rows by name and tells pension from study fund', () => {
    assert.ok(type('pension_annual').matchesRequiredDocument({ name: 'אישור יתרה בקופת גמל / קרן פנסיה ליום 31.12.2025 — מגדל מקפת' }));
    assert.ok(!type('study_fund_annual').matchesRequiredDocument({ name: 'אישור יתרה בקופת גמל / קרן פנסיה ליום 31.12.2025 — מגדל מקפת' }));
    assert.ok(type('study_fund_annual').matchesRequiredDocument({ name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מגדל' }));
    assert.ok(!type('pension_annual').matchesRequiredDocument({ name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מגדל' }));
    assert.ok(!type('study_fund_annual').matchesRequiredDocument({ name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל' }));
    assert.ok(!type('pension_annual').matchesRequiredDocument({ name: 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — הפניקס' }));
  });

  it('labels and wording carry the on-site title and the products', () => {
    const docs = [
      { buffer: Buffer.alloc(0), filename: 'a.pdf', contentType: 'application/pdf', title: 'דוח שנתי לעמית- מקפת אישית - לשנת 2024', kind: 'pension_annual' },
      { buffer: Buffer.alloc(0), filename: 'b.pdf', contentType: 'application/pdf', title: 'דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024', kind: 'pension_annual' },
    ];
    assert.equal(spec.delivery.fileLabel(docs[0]!, 2024), 'דוח שנתי לעמית- מקפת אישית - לשנת 2024 — מגדל 2024');
    assert.match(spec.delivery.waConfirmation(docs, true), /2 דוחות שנתיים של הפנסיה שלך ממגדל/);
    assert.match(spec.delivery.emailSubject(docs, 2024), /פנסיה.*מגדל.*2024/);
    const body = spec.delivery.emailBodyLines(docs, 2024);
    assert.ok(body.some((l) => l.includes('דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024')));
    const mixed = [docs[0]!, { ...docs[1]!, title: 'דוח שנתי לעמית - קרן השתלמות - לשנת 2024', kind: 'study_fund_annual' }];
    assert.match(spec.delivery.waConfirmation(mixed, false, ['study_fund_annual']), /הפנסיה וקרן ההשתלמות/);
    assert.match(spec.delivery.waConfirmation(mixed, false, ['study_fund_annual']), /מצאתי שם גם את קרן ההשתלמות שלך/);
  });
});

// The code step (production 2026-11-28): the site sends the code by itself on
// the sixth digit, so the button is pressed only when the site did not.
describe('migdal code step', () => {
  it('presses the button only when the site did not submit and the button is on the code screen', () => {
    assert.equal(shouldPressSubmit({ siteSubmitted: false, onCodeScreen: true, buttonVisible: true }), true);
    assert.equal(shouldPressSubmit({ siteSubmitted: true, onCodeScreen: true, buttonVisible: true }), false);
    assert.equal(shouldPressSubmit({ siteSubmitted: false, onCodeScreen: false, buttonVisible: true }), false);
    assert.equal(shouldPressSubmit({ siteSubmitted: false, onCodeScreen: true, buttonVisible: false }), false);
  });

  it('counts only a POST to the site itself as its own submit', () => {
    assert.equal(isMigdalFormPost('POST', 'https://my.migdal.co.il/mymigdal/api/login'), true);
    assert.equal(isMigdalFormPost('GET', 'https://my.migdal.co.il/mymigdal/api/login'), false);
    assert.equal(isMigdalFormPost('POST', 'https://analytics.google.com/g/collect'), false);
    assert.equal(isMigdalFormPost('POST', 'https://notmigdal.co.il/x'), false);
    assert.equal(isMigdalFormPost('POST', 'not a url'), false);
  });
});

// The result list (seen live 2026-11-28): one result shows a success line and
// no "נמצאו N תוצאות" heading, so rows are read from the row links alone.
describe('migdal list outcome', () => {
  it('reads rows from the row links, with or without the results heading', () => {
    assert.equal(listOutcomeOf('תהליך הפקת האישור הסתיים בהצלחה דוח שנתי לעמית- מקפת אישית - לשנת 2016', 2), 'rows');
    assert.equal(listOutcomeOf('נמצאו 6 תוצאות דוח שנתי - בריאות - לשנת 2020', 12), 'rows');
  });

  it('answers empty on the no-data text and nothing while the page shows neither', () => {
    assert.equal(listOutcomeOf('לא מצאנו נתונים לתצוגה. נסה לשנות את בחירתך', 0), 'empty');
    assert.equal(listOutcomeOf('הצג אישור', 0), null);
  });
});

// The year rule (openspec `migdal-fetch`, dropdowns as seen live 2026-11-28):
// the year when offered, else "כל השנים", where only the title tells the year.
describe('migdal year rule', () => {
  const ANNUAL_YEARS = ['כל השנים', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019'];
  const TAX_YEARS = ['2025', '2024', '2023', '2022', '2021', '2020', '2019'];

  it('selects the tax year when the dropdown offers it', () => {
    assert.deepEqual(chooseYearOption(ANNUAL_YEARS, 2024), { label: '2024', mode: 'year' });
  });

  it('falls back to all years when the year is not offered', () => {
    assert.deepEqual(chooseYearOption(ANNUAL_YEARS, 2016), { label: 'כל השנים', mode: 'all_years' });
  });

  it('chooses nothing when neither the year nor all years is offered', () => {
    assert.equal(chooseYearOption(TAX_YEARS, 2016), null);
    assert.equal(chooseYearOption([], 2024), null);
  });

  it('takes only the rows titled for the tax year from an all-years list', () => {
    const rows = [
      row(0, 'דוח שנתי - בריאות - לשנת 2020'),
      row(2, 'דוח שנתי - בריאות - לשנת 2017'),
      row(4, 'דוח שנתי לעמית- מקפת  אישית - לשנת 2016'),
    ];
    assert.deepEqual(
      selectMigdalRows(rows, 2016, 'pension_annual', new Set()).map((r) => r.index),
      [4],
    );
    assert.equal(selectMigdalRows(rows, 2012, 'pension_annual', new Set()).length, 0);
  });

  it('finds the year anywhere in the title, whatever the wording around it', () => {
    assert.equal(titleCarriesYear('דוח שנתי לעמית - לשנת 2016', 2016), true);
    assert.equal(titleCarriesYear('אישור מס לשנת 2016 עבור מקפת אישית', 2016), true);
    assert.equal(titleCarriesYear('דוח שנתי 2016 לעמית - מקפת אישית', 2016), true);
    assert.equal(titleCarriesYear('2016 - דוח שנתי לעמית', 2016), true);
    assert.equal(titleCarriesYear('דוח ליום 31.12.2016', 2016), true);
    assert.equal(titleCarriesYear('דוח שנתי - בריאות - לשנת 2020', 2016), false);
    assert.equal(titleCarriesYear('דוח שנתי לעמית', 2016), false);
  });

  it('does not count the four digits inside a longer number', () => {
    assert.equal(titleCarriesYear('דוח 120165 לעמית', 2016), false);
    assert.equal(titleCarriesYear('דוח שנתי לעמית - לשנת 20161', 2016), false);
    assert.equal(titleCarriesYear('פוליסה 120165 - לשנת 2016', 2016), true);
  });
});

// The tax certificate lists the account's own product names (seen live
// 2026-11-28), so each is sorted by its name.
describe('migdal tax certificate', () => {
  it('sorts a product name into pension, study fund or nothing', () => {
    assert.equal(classifyTaxCertificateProduct('מקפת אישית'), 'pension_annual');
    assert.equal(classifyTaxCertificateProduct('מגדל השתלמות'), 'study_fund_annual');
    assert.equal(classifyTaxCertificateProduct('קופת גמל להשקעה'), 'pension_annual');
    assert.equal(classifyTaxCertificateProduct('בריאות'), null);
    assert.equal(classifyTaxCertificateProduct('כל המוצרים'), null);
    assert.equal(classifyTaxCertificateProduct('ביטוח חיים'), null);
  });

  it('takes the certificate of the year and tags it by the product kind', () => {
    const rows = [row(0, 'אישור מס לשנת 2024 עבור מקפת אישית')];
    assert.deepEqual(selectMigdalRows(rows, 2024, 'pension_annual', new Set()), [
      { index: 0, title: 'אישור מס לשנת 2024 עבור מקפת אישית', kind: 'pension_annual' },
    ]);
    assert.equal(selectMigdalRows(rows, 2025, 'pension_annual', new Set()).length, 0);
  });

  it('describes both document types with the tax certificate', () => {
    for (const doc of getProviderSpec('migdal').documents) assert.match(doc.documentDescriptionHe, /דוח שנתי מלא, דוח שנתי מקוצר ואישור מס/);
  });

  it('calls the files documents when a tax certificate is among them, annual reports otherwise', () => {
    const spec = getProviderSpec('migdal');
    const report = { buffer: Buffer.alloc(0), filename: 'a.pdf', contentType: 'application/pdf', title: 'דוח שנתי לעמית- מקפת אישית - לשנת 2024', kind: 'pension_annual' };
    const certificate = { ...report, filename: 'c.pdf', title: 'אישור מס לשנת 2024 עבור מקפת אישית' };
    assert.equal(spec.delivery.fileLabel(certificate, 2024), 'אישור מס לשנת 2024 עבור מקפת אישית — מגדל 2024');
    assert.match(spec.delivery.waConfirmation([report, certificate], true), /2 מסמכים של הפנסיה שלך ממגדל/);
    assert.match(spec.delivery.emailSubject([report, certificate], 2024), /^מסמכים \(פנסיה\) - מגדל - 2024$/);
    assert.ok(spec.delivery.emailBodyLines([report, certificate], 2024)[0]!.includes('2 המסמכים של הפנסיה'));
    assert.ok(spec.delivery.emailBodyLines([report, certificate], 2024).some((l) => l.includes('אישור מס לשנת 2024 עבור מקפת אישית')));
    assert.match(spec.delivery.waConfirmation([certificate], false), /את המסמך של הפנסיה שלך ממגדל/);
    assert.match(spec.delivery.emailSubject([certificate], 2024), /^מסמך \(פנסיה\)/);
    // Reports only: the annual-report wording stays.
    assert.match(spec.delivery.waConfirmation([report], true), /את הדוח השנתי של הפנסיה שלך ממגדל/);
    assert.match(spec.delivery.emailSubject([report], 2024), /^דוח שנתי \(פנסיה\)/);
  });
});
