import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getProviderSpec } from '../src/agents/declarationOfCapital/documentFetch/providers.js';
import type { FetchedDocument } from '../src/agents/declarationOfCapital/documentFetch/types.js';

// Meitav worker-side spec (openspec `meitav-fetch`): which checklist rows make
// the fetch offerable, and the delivery wording.
describe('meitav provider spec', () => {
  const spec = getProviderSpec('meitav');
  const type = (key: string) => spec.documents.find((d) => d.key === key)!;
  const matches = (key: string, name: string) => type(key).matchesRequiredDocument({ name });

  it('is an SMS login with id + phone that takes every document', () => {
    assert.equal(spec.siteNameHe, 'מיטב');
    assert.equal(spec.otpChannel, 'sms');
    assert.equal(spec.takesAllDocuments, true);
    assert.match(spec.messages.otpSent, /מיטב/);
    assert.deepEqual(
      spec.documents.map((d) => [d.key, d.catalogTypeKey]),
      [
        ['pension_annual', 'pension_provident'],
        ['study_fund_annual', 'study_fund'],
      ],
    );
  });

  it('matches pension and study-fund rows that name Meitav', () => {
    assert.equal(matches('pension_annual', 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — מיטב'), true);
    assert.equal(matches('pension_annual', 'קופת גמל — מיטב דש'), true);
    assert.equal(matches('study_fund_annual', 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מיטב'), true);
    assert.equal(matches('pension_annual', 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מיטב'), false);
    assert.equal(matches('study_fund_annual', 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — מיטב'), false);
  });

  it('never matches a Meitav Trade securities row or another company', () => {
    const trade = 'אישור יתרה של תיק ניירות הערך ליום 31.12.2025 — מיטב טרייד';
    assert.equal(matches('pension_annual', trade), false);
    assert.equal(matches('study_fund_annual', trade), false);
    assert.equal(matches('pension_annual', 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — מגדל מקפת'), false);
    assert.equal(matches('study_fund_annual', 'אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל'), false);
  });

  it('labels files by their on-site title and lists them in the email', () => {
    const docs: FetchedDocument[] = [
      { buffer: Buffer.from(''), filename: 'a.pdf', contentType: 'application/pdf', title: 'דוח שנתי מפורט דצמבר 2023', kind: 'pension_annual' },
      { buffer: Buffer.from(''), filename: 'b.pdf', contentType: 'application/pdf', title: 'דוח שנתי מקוצר דצמבר 2023', kind: 'study_fund_annual' },
    ];
    assert.equal(spec.delivery.fileLabel(docs[0]!, 2023), 'דוח שנתי מפורט דצמבר 2023 — מיטב 2023');
    assert.match(spec.delivery.waConfirmation(docs, true), /2 דוחות שנתיים של הפנסיה וקרן ההשתלמות שלך ממיטב/);
    assert.match(spec.delivery.waConfirmation(docs, false, ['study_fund_annual']), /מצאתי שם גם את קרן ההשתלמות שלך/);
    assert.equal(spec.delivery.emailSubject(docs, 2023), 'דוחות שנתיים (פנסיה וקרן השתלמות) - מיטב - 2023');
    const body = spec.delivery.emailBodyLines(docs, 2023);
    assert.ok(body.some((l) => l.includes('דוח שנתי מפורט דצמבר 2023 — הפנסיה')));
    assert.ok(body.some((l) => l.includes('דוח שנתי מקוצר דצמבר 2023 — קרן ההשתלמות')));
  });
});
