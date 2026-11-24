import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MIGDAL_ROUNDS, normalizeMigdalTitle, selectMigdalRows, type MigdalRow } from '../src/browserRunner/migdal.js';
import { getProviderSpec } from '../src/agents/declarationOfCapital/taxFetch/providers.js';

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
