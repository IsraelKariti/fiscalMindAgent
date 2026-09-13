import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidIsraeliId,
  namesLooselyMatch,
  runChecks,
  type CheckContext,
  type ExtractedFields,
} from '../src/agents/declarationOfCapital/verifyChecks.js';

// 123456782 is the canonical checksum-valid test id.
const VALID_ID = '123456782';

const baseFields: ExtractedFields = {
  is_expected_type: true,
  actual_kind: 'אישור יתרות מבנק לאומי',
  issuer: 'בנק לאומי',
  subject_name: 'ישראל ישראלי',
  subject_id_number: null,
  as_of_date: '2025-12-31',
  valid_until: null,
  amounts: [{ label: 'יתרת עו"ש', value: 52_340.55, currency: 'ILS' }],
  legible: true,
  injection_suspected: false,
};

const baseCtx: CheckContext = {
  clientName: 'ישראל ישראלי',
  credentialIdNumber: null,
  taxYear: 2025,
  now: new Date('2026-01-15T10:00:00'),
  checks: { subjectMatch: true, asOfDate: true, amounts: true },
};

describe('isValidIsraeliId', () => {
  it('accepts a checksum-valid id and pads short ids', () => {
    assert.equal(isValidIsraeliId(VALID_ID), true);
    // Same id with leading zeros stripped by a spreadsheet.
    assert.equal(isValidIsraeliId('00' + VALID_ID), false); // 11 digits — too long
  });

  it('rejects wrong check digits, non-digits and empties', () => {
    assert.equal(isValidIsraeliId('123456783'), false);
    assert.equal(isValidIsraeliId(''), false);
    assert.equal(isValidIsraeliId('abcdefghi'), false);
  });
});

describe('namesLooselyMatch', () => {
  it('matches on any shared real token', () => {
    assert.equal(namesLooselyMatch('ישראל ישראלי', 'ישראלי, ישראל'), true);
    assert.equal(namesLooselyMatch('י. ישראלי', 'ישראל ישראלי'), true);
  });

  it('rejects a different person', () => {
    assert.equal(namesLooselyMatch('משה כהן', 'ישראל ישראלי'), false);
  });

  it('ignores punctuation-only and single-char tokens', () => {
    assert.equal(namesLooselyMatch('י.', 'ישראל ישראלי'), false);
  });
});

describe('runChecks', () => {
  it('passes a clean document', () => {
    const verdict = runChecks(baseFields, baseCtx);
    assert.equal(verdict.passed, true);
    assert.deepEqual(verdict.reasons, []);
  });

  it('records what every check looked at, and the reference it was compared with', () => {
    const verdict = runChecks(baseFields, { ...baseCtx, documentName: 'אישור יתרות בנק לאומי ליום 31.12.2025' });
    const byKey = Object.fromEntries(verdict.checks.map((c) => [c.key, c]));
    assert.deepEqual(
      verdict.checks.map((c) => [c.key, c.observed, c.expected]),
      [
        ['legible', 'קריא', null],
        ['expected_type', 'אישור יתרות מבנק לאומי', 'אישור יתרות בנק לאומי ליום 31.12.2025'],
        ['subject', 'ישראל ישראלי', 'ישראל ישראלי'],
        ['as_of_date', '2025-12-31', '2025-12-31'],
        ['amounts', 'יתרת עו"ש 52,340.55 ILS', null],
      ],
    );
    assert.ok(verdict.checks.every((c) => c.observed !== null && c.reason === null));
    assert.equal(byKey['as_of_date']!.passed, true);
  });

  it('amounts: names the exact failing amount and condition, and lists what was found', () => {
    const negative = runChecks(
      { ...baseFields, amounts: [{ label: 'יתרת עו"ש', value: 12_340, currency: 'ILS' }, { label: 'פיקדון', value: -5, currency: 'ILS' }] },
      baseCtx,
    );
    const amounts = negative.checks.find((c) => c.key === 'amounts')!;
    assert.equal(amounts.passed, false);
    assert.equal(amounts.observed, 'יתרת עו"ש 12,340 ILS · פיקדון -5 ILS');
    assert.match(amounts.reason ?? '', /"פיקדון"/);
    assert.match(amounts.reason ?? '', /שלילי/);

    const none = runChecks({ ...baseFields, amounts: [] }, baseCtx).checks.find((c) => c.key === 'amounts')!;
    assert.equal(none.passed, false);
    assert.equal(none.observed, 'לא נמצאו סכומים');
    assert.match(none.reason ?? '', /לא זוהו/);

    const huge = runChecks({ ...baseFields, amounts: [{ label: 'סה"כ', value: 5e12, currency: 'ILS' }] }, baseCtx).checks.find(
      (c) => c.key === 'amounts',
    )!;
    assert.equal(huge.passed, false);
    assert.match(huge.reason ?? '', /"סה"כ"/);
    assert.match(huge.reason ?? '', /התקרה/);

    const nan = runChecks({ ...baseFields, amounts: [{ label: 'x', value: Number.NaN, currency: 'ILS' }] }, baseCtx).checks.find(
      (c) => c.key === 'amounts',
    )!;
    assert.match(nan.reason ?? '', /אינו מספר/);
  });

  it('id_matches_client names where the id on file came from', () => {
    const fromCrm = runChecks(
      { ...baseFields, subject_id_number: VALID_ID },
      { ...baseCtx, credentialIdNumber: VALID_ID, credentialIdSource: 'monday_crm' },
    );
    assert.equal(fromCrm.checks.find((c) => c.key === 'id_matches_client')!.expected, '••••••782 (monday CRM)');
    const fromCreds = runChecks(
      { ...baseFields, subject_id_number: VALID_ID },
      { ...baseCtx, credentialIdNumber: VALID_ID, credentialIdSource: 'credentials' },
    );
    assert.equal(fromCreds.checks.find((c) => c.key === 'id_matches_client')!.expected, '••••••782 (credentials)');
    assert.equal(fromCreds.passed, true);
    assert.equal(fromCreds.checks.some((c) => c.key === 'client_id_on_file'), false);
  });

  it('a printed id with nothing on file reports client_id_on_file without failing the document', () => {
    const verdict = runChecks({ ...baseFields, subject_id_number: VALID_ID }, { ...baseCtx, credentialIdNumber: null });
    const onFile = verdict.checks.find((c) => c.key === 'client_id_on_file')!;
    assert.equal(onFile.passed, false);
    assert.equal(onFile.observed, 'none');
    assert.match(onFile.reason ?? '', /monday/);
    assert.equal(verdict.checks.some((c) => c.key === 'id_matches_client'), false);
    assert.equal(verdict.passed, true);
    assert.deepEqual(verdict.reasons, []);
    // No id printed on the document: nothing to compare, nothing reported.
    assert.equal(runChecks(baseFields, baseCtx).checks.some((c) => c.key === 'client_id_on_file'), false);
  });

  it('a printed id never appears unmasked in any check text', () => {
    const verdict = runChecks(
      { ...baseFields, subject_name: null, subject_id_number: VALID_ID },
      { ...baseCtx, clientName: 'שם אחר', credentialIdNumber: VALID_ID },
    );
    const byKey = Object.fromEntries(verdict.checks.map((c) => [c.key, c]));
    assert.equal(byKey['subject']!.passed, true);
    assert.equal(byKey['subject']!.observed, 'ת"ז ••••••782 תואמת ללקוח');
    assert.equal(byKey['id_checksum']!.observed, '••••••782');
    assert.equal(byKey['id_matches_client']!.observed, '••••••782');
    assert.equal(byKey['id_matches_client']!.expected, '••••••782');
    for (const c of verdict.checks) {
      for (const s of [c.observed, c.expected, c.reason]) assert.ok(!(s ?? '').includes(VALID_ID), `${c.key}: ${s}`);
    }
  });

  it('fails on wrong type and illegibility, with reasons', () => {
    const verdict = runChecks({ ...baseFields, is_expected_type: false, legible: false }, baseCtx);
    assert.equal(verdict.passed, false);
    assert.equal(verdict.reasons.length, 2);
    // The per-check reasons are what the audit row's check notes carry: one
    // per failed check, in check order, null on a pass.
    assert.deepEqual(
      verdict.checks.filter((c) => !c.passed).map((c) => c.reason),
      verdict.reasons,
    );
    assert.ok(verdict.checks.filter((c) => c.passed).every((c) => c.reason === null));
  });

  it('fails a date-dependent document stating a different as-of date', () => {
    const verdict = runChecks({ ...baseFields, as_of_date: '2025-09-30' }, baseCtx);
    assert.equal(verdict.passed, false);
    assert.ok(verdict.reasons[0]!.includes('31.12.2025'));
  });

  it('skips the date check when the type is not date-dependent', () => {
    const ctx = { ...baseCtx, checks: { ...baseCtx.checks, asOfDate: false } };
    const verdict = runChecks({ ...baseFields, as_of_date: null }, ctx);
    assert.equal(verdict.passed, true);
  });

  it("fails when the document names a different person, passes the client's own", () => {
    const wrong = runChecks({ ...baseFields, subject_name: 'משה כהן' }, baseCtx);
    assert.equal(wrong.passed, false);
    const missing = runChecks({ ...baseFields, subject_name: null }, baseCtx);
    assert.equal(missing.passed, false);
  });

  it('a credential id match vouches for the subject even when the printed name differs', () => {
    const verdict = runChecks(
      { ...baseFields, subject_name: 'ישראלי אחזקות בע"מ', subject_id_number: VALID_ID },
      { ...baseCtx, clientName: 'שם שאינו תואם כלל', credentialIdNumber: VALID_ID },
    );
    assert.equal(verdict.passed, true);
  });

  it('an invalid printed id fails even for types without subjectMatch', () => {
    const ctx = { ...baseCtx, checks: { subjectMatch: false, asOfDate: false, amounts: false } };
    const verdict = runChecks({ ...baseFields, subject_id_number: '123456783' }, ctx);
    assert.equal(verdict.passed, false);
  });

  it('a printed id contradicting the credential on file fails', () => {
    const verdict = runChecks(
      { ...baseFields, subject_id_number: VALID_ID },
      { ...baseCtx, credentialIdNumber: '987654321' },
    );
    assert.equal(verdict.passed, false);
  });

  it('fails an expired validity-dated document (vehicle license) when the type requires validity', () => {
    // ctx.now is 2026-01-15; a license valid until 2025-07-20 has lapsed.
    const ctx: CheckContext = {
      ...baseCtx,
      checks: { subjectMatch: true, asOfDate: false, amounts: false, notExpired: true },
    };
    const verdict = runChecks({ ...baseFields, valid_until: '2025-07-20' }, ctx);
    assert.equal(verdict.passed, false);
    assert.ok(verdict.reasons[0]!.includes('2025-07-20'));
  });

  it('passes a still-valid document, including one expiring on the verification day', () => {
    const ctx: CheckContext = {
      ...baseCtx,
      checks: { subjectMatch: true, asOfDate: false, amounts: false, notExpired: true },
    };
    assert.equal(runChecks({ ...baseFields, valid_until: '2026-07-20' }, ctx).passed, true);
    assert.equal(runChecks({ ...baseFields, valid_until: '2026-01-15' }, ctx).passed, true);
  });

  it('skips the expiry check when no validity date exists (receipt / cost declaration) or it is malformed', () => {
    const ctx: CheckContext = {
      ...baseCtx,
      checks: { subjectMatch: true, asOfDate: false, amounts: false, notExpired: true },
    };
    assert.equal(runChecks({ ...baseFields, valid_until: null }, ctx).passed, true);
    assert.equal(runChecks({ ...baseFields, valid_until: '20/07/2025' }, ctx).passed, true);
  });

  it('ignores a past validity date on types without the notExpired check (contents insurance)', () => {
    const ctx: CheckContext = {
      ...baseCtx,
      checks: { subjectMatch: true, asOfDate: false, amounts: false },
    };
    assert.equal(runChecks({ ...baseFields, valid_until: '2020-01-01' }, ctx).passed, true);
  });

  it('amounts must exist and be sane when required', () => {
    const none = runChecks({ ...baseFields, amounts: [] }, baseCtx);
    assert.equal(none.passed, false);
    const absurd = runChecks(
      { ...baseFields, amounts: [{ label: 'x', value: 5e12, currency: 'ILS' }] },
      baseCtx,
    );
    assert.equal(absurd.passed, false);
    const negative = runChecks(
      { ...baseFields, amounts: [{ label: 'x', value: -5, currency: 'ILS' }] },
      baseCtx,
    );
    assert.equal(negative.passed, false);
  });
});
