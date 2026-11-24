import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { phoenixKindOfSector, selectPhoenixRows, type PhoenixRow } from '../src/browserRunner/phoenix.js';
import { getProviderSpec } from '../src/agents/declarationOfCapital/taxFetch/providers.js';

// Phoenix reports-list selection (openspec `phoenix-fetch`): sector decides the
// kind, the NAME carries the year, quarterly rows are skipped, nothing is
// deduplicated. Rows below are the owner's real list as seen live 2026-11-24.
const row = (dateText: string, name: string, sector: string): PhoenixRow => ({ dateText, name, sector });

const LIST_2024_2023: PhoenixRow[] = [
  row('15.03.2025', 'דוח שנתי מלא 2024', 'גמל והשתלמות'),
  row('15.03.2025', 'דוח שנתי מקוצר ואישור מס 2024', 'גמל והשתלמות'),
  row('15.03.2024', 'דוח שנתי מלא 2023', 'גמל והשתלמות'),
  row('15.03.2024', 'דוח שנתי מקוצר ואישור מס 2023', 'גמל והשתלמות'),
  row('31.12.2023', 'אישור מס ביטוח חיים מקוצר לשנת 2023', 'חיים/פנסיה'),
  row('31.12.2023', 'דוח מפורט לשנת 2023', 'חיים/פנסיה'),
  row('31.12.2023', 'דוח מקוצר לשנת 2023', 'חיים/פנסיה'),
  row('30.09.2023', 'דוח רבעון שלישי לשנת 2023', 'חיים/פנסיה'),
  row('30.06.2023', 'דוח רבעון שני לשנת 2023', 'חיים/פנסיה'),
  row('31.12.2024', 'דוח מפורט לשנת 2024', 'חיים/פנסיה'),
];

describe('phoenix row selection', () => {
  it('maps the sector column to a document kind', () => {
    assert.equal(phoenixKindOfSector('חיים/פנסיה'), 'pension_annual');
    assert.equal(phoenixKindOfSector('גמל והשתלמות'), 'study_fund_annual');
    assert.equal(phoenixKindOfSector('ביטוח כללי'), null);
  });

  it('study fund 2024: only the two גמל והשתלמות rows named 2024', () => {
    const picked = selectPhoenixRows(LIST_2024_2023, 2024, ['study_fund_annual']);
    assert.deepEqual(
      picked.map((r) => [r.index, r.name, r.kind]),
      [
        [0, 'דוח שנתי מלא 2024', 'study_fund_annual'],
        [1, 'דוח שנתי מקוצר ואישור מס 2024', 'study_fund_annual'],
      ],
    );
  });

  it('pension 2023: the three annual rows, quarterly rows skipped', () => {
    const picked = selectPhoenixRows(LIST_2024_2023, 2023, ['pension_annual']);
    assert.deepEqual(
      picked.map((r) => r.name),
      ['אישור מס ביטוח חיים מקוצר לשנת 2023', 'דוח מפורט לשנת 2023', 'דוח מקוצר לשנת 2023'],
    );
    assert.ok(picked.every((r) => r.kind === 'pension_annual'));
  });

  it('the year comes from the name, never from the date column', () => {
    // Dated 15.03.2025 but named 2024 → taken for 2024; dated 31.12.2024 but named 2024 under pension is taken too,
    // while nothing dated 2024 whose name says 2023 is taken for 2024.
    const picked = selectPhoenixRows(LIST_2024_2023, 2024, ['pension_annual', 'study_fund_annual']);
    assert.deepEqual(picked.map((r) => r.name), ['דוח שנתי מלא 2024', 'דוח שנתי מקוצר ואישור מס 2024', 'דוח מפורט לשנת 2024']);
    assert.ok(picked.every((r) => r.name.includes('2024')));
  });

  it('both types pending but only one agreed: the other sector is left alone', () => {
    const picked = selectPhoenixRows(LIST_2024_2023, 2023, ['study_fund_annual']);
    assert.deepEqual(picked.map((r) => r.name), ['דוח שנתי מלא 2023', 'דוח שנתי מקוצר ואישור מס 2023']);
    assert.equal(selectPhoenixRows(LIST_2024_2023, 2023, []).length, 0);
  });

  it('identical names are kept — one row per policy', () => {
    const twoPolicies = [row('31.12.2016', 'דוח מפורט לשנת 2016', 'חיים/פנסיה'), row('31.12.2016', 'דוח מפורט לשנת 2016', 'חיים/פנסיה')];
    assert.equal(selectPhoenixRows(twoPolicies, 2016, ['pension_annual']).length, 2);
  });
});

describe('phoenix provider spec', () => {
  const spec = getProviderSpec('phoenix');
  const type = (key: string) => spec.documents.find((d) => d.key === key)!;

  it('matches Phoenix checklist rows by name and tells pension from study fund', () => {
    assert.ok(type('study_fund_annual').matchesRequiredDocument({ name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — הפניקס' }));
    assert.ok(!type('pension_annual').matchesRequiredDocument({ name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — הפניקס' }));
    assert.ok(type('pension_annual').matchesRequiredDocument({ name: 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — הפניקס פנסיה וגמל' }));
    assert.ok(!type('study_fund_annual').matchesRequiredDocument({ name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל' }));
    assert.ok(!type('pension_annual').matchesRequiredDocument({ name: 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — אלטשולר שחם' }));
  });

  it('labels and wording carry the on-site report name and the products', () => {
    const docs = [
      { buffer: Buffer.alloc(0), filename: 'a.pdf', contentType: 'application/pdf', title: 'דוח שנתי מלא 2024', kind: 'study_fund_annual' },
      { buffer: Buffer.alloc(0), filename: 'b.pdf', contentType: 'application/pdf', title: 'דוח שנתי מקוצר ואישור מס 2024', kind: 'study_fund_annual' },
    ];
    assert.equal(spec.delivery.fileLabel(docs[0]!, 2024), 'דוח שנתי מלא 2024 — הפניקס 2024');
    assert.match(spec.delivery.waConfirmation(docs, true), /2 דוחות שנתיים של קרן ההשתלמות שלך מהפניקס/);
    assert.match(spec.delivery.emailSubject(docs, 2024), /קרן השתלמות.*הפניקס.*2024/);
    const body = spec.delivery.emailBodyLines(docs, 2024);
    assert.ok(body.some((l) => l.includes('דוח שנתי מקוצר ואישור מס 2024')));
    const mixed = [docs[0]!, { ...docs[1]!, title: 'דוח מפורט לשנת 2024', kind: 'pension_annual' }];
    assert.match(spec.delivery.waConfirmation(mixed, false), /קרן ההשתלמות והפנסיה/);
  });
});
