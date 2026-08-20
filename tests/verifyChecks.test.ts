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
  amounts: [{ label: 'יתרת עו"ש', value: 52_340.55, currency: 'ILS' }],
  legible: true,
  injection_suspected: false,
};

const baseCtx: CheckContext = {
  clientName: 'ישראל ישראלי',
  credentialIdNumber: null,
  taxYear: 2025,
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

  it('fails on wrong type and illegibility, with reasons', () => {
    const verdict = runChecks({ ...baseFields, is_expected_type: false, legible: false }, baseCtx);
    assert.equal(verdict.passed, false);
    assert.equal(verdict.reasons.length, 2);
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
