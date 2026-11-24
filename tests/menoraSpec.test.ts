import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getProviderSpec } from '../src/agents/declarationOfCapital/taxFetch/providers.js';
import type { FetchedDocument } from '../src/agents/declarationOfCapital/taxFetch/types.js';

// Menora worker-side spec (openspec `menora-fetch`): which checklist rows make
// the fetch offerable, and the delivery wording.
describe('menora provider spec', () => {
  const spec = getProviderSpec('menora_mivtachim');
  const type = (key: string) => spec.documents.find((d) => d.key === key)!;
  const matches = (key: string, name: string) => type(key).matchesRequiredDocument({ name });

  it('is an SMS login with id + phone that takes every document', () => {
    assert.equal(spec.siteNameHe, 'מנורה מבטחים');
    assert.equal(spec.otpChannel, 'sms');
    assert.equal(spec.takesAllDocuments, true);
    assert.match(spec.messages.otpSent, /מנורה מבטחים/);
    assert.deepEqual(
      spec.documents.map((d) => [d.key, d.catalogTypeKey]),
      [
        ['pension_annual', 'pension_provident'],
        ['study_fund_annual', 'study_fund'],
      ],
    );
  });

  it('matches pension and study-fund rows that name Menora', () => {
    assert.equal(matches('pension_annual', 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — מנורה מבטחים'), true);
    assert.equal(matches('pension_annual', 'קרן פנסיה — Menora'), true);
    assert.equal(matches('study_fund_annual', 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מנורה'), true);
    assert.equal(matches('pension_annual', 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מנורה'), false);
    assert.equal(matches('study_fund_annual', 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — מנורה מבטחים'), false);
  });

  it('never matches another company', () => {
    assert.equal(matches('pension_annual', 'אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — מיטב'), false);
    assert.equal(matches('study_fund_annual', 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מגדל'), false);
  });

  it('labels files by their on-site title and lists them in the email', () => {
    const docs: FetchedDocument[] = [
      { buffer: Buffer.from(''), filename: 'a.pdf', contentType: 'application/pdf', title: 'דוח שנתי מקוצר 2025 — מנורה מבטחים פנסיה מקיפה', kind: 'pension_annual' },
      { buffer: Buffer.from(''), filename: 'b.pdf', contentType: 'application/pdf', title: 'דוח שנתי מקוצר 2025 — מנורה מבטחים השתלמות', kind: 'study_fund_annual' },
    ];
    assert.equal(spec.delivery.fileLabel(docs[0]!, 2025), 'דוח שנתי מקוצר 2025 — מנורה מבטחים פנסיה מקיפה — מנורה מבטחים 2025');
    assert.match(spec.delivery.waConfirmation(docs, true), /2 דוחות שנתיים של הפנסיה וקרן ההשתלמות שלך ממנורה מבטחים/);
    assert.match(spec.delivery.waConfirmation(docs, false, ['study_fund_annual']), /מצאתי שם גם את קרן ההשתלמות שלך/);
    assert.equal(spec.delivery.emailSubject(docs, 2025), 'דוחות שנתיים ואישורי מס (פנסיה וקרן השתלמות) - מנורה מבטחים - 2025');
    const body = spec.delivery.emailBodyLines(docs, 2025);
    assert.ok(body.some((l) => l.includes('דוח שנתי מקוצר 2025 — מנורה מבטחים השתלמות — קרן ההשתלמות')));
  });
});
