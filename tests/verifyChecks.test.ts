import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountsCheck,
  asOfDateCheck,
  expectedTypeCheck,
  identityChecks,
  isValidIsraeliId,
  legibleCheck,
  namesLooselyMatch,
  notExpiredCheck,
  periodCoversValuationDateCheck,
  typeFieldValue,
  typeFieldsCheck,
  verdictOf,
  type CheckContext,
  type DocumentParty,
  type ExtractedFields,
} from '../src/agents/declarationOfCapital/verifyChecks.js';
import type { TypeField } from '../src/agents/declarationOfCapital/documentTypes/types.js';
import loanTaken from '../src/agents/declarationOfCapital/documentTypes/loanTaken.js';
import otherAssets from '../src/agents/declarationOfCapital/documentTypes/otherAssets.js';
import { buildExtractionCall } from '../src/agents/declarationOfCapital/extractionCall.js';
import { GENERIC_DOCUMENT_TYPE } from '../src/agents/declarationOfCapital/documentTypes/index.js';

// The shared check library (verifyChecks.ts): each helper on its own, and the
// verdict through a type module with no extra fields (loan_taken: owner,
// as-of date, amounts). The per-type scenarios live in documentTypes.test.ts.

// 123456782 is the canonical checksum-valid test id.
const VALID_ID = '123456782';

const baseFields: ExtractedFields = {
  is_expected_type: true,
  actual_kind: 'אישור יתרות מבנק לאומי',
  issuer: 'בנק לאומי',
  parties: [{ name: 'ישראל ישראלי', id_number: null, role: 'owner' }],
  as_of_date: '2025-12-31',
  valid_until: null,
  amounts: [{ label: 'יתרת עו"ש', value: 52_340.55, currency: 'ILS' }],
  legible: true,
  injection_suspected: false,
};

/** One owner party as the extraction lists it (a blank name stands for "none printed"). */
const owner = (name: string | null, id: string | null): DocumentParty => ({ name: name ?? '', id_number: id, role: 'owner' });

const baseCtx: CheckContext = {
  clientName: 'ישראל ישראלי',
  credentialIdNumber: null,
  taxYear: 2025,
  now: new Date('2026-01-15T10:00:00'),
};

/** The verdict of a type whose checks are owner + as-of date + amounts and no extra fields. */
const verify = (fields: ExtractedFields, ctx: CheckContext = baseCtx) => loanTaken.verify(fields, ctx);

describe('isValidIsraeliId', () => {
  it('accepts a checksum-valid id and pads short ids', () => {
    assert.equal(isValidIsraeliId(VALID_ID), true);
    // Same id zero-padded to a wider field (Bank Hapoalim prints 16 digits).
    assert.equal(isValidIsraeliId('00' + VALID_ID), true);
    assert.equal(isValidIsraeliId('0000000' + VALID_ID), true);
  });

  it('rejects wrong check digits, too many significant digits, non-digits and empties', () => {
    assert.equal(isValidIsraeliId('123456783'), false);
    assert.equal(isValidIsraeliId('1234567890'), false);
    assert.equal(isValidIsraeliId('12345678a'), false);
    assert.equal(isValidIsraeliId(''), false);
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

describe('the verdict through a type module (loan_taken: owner, date, amounts)', () => {
  it('passes a clean document', () => {
    const verdict = verify(baseFields);
    assert.equal(verdict.passed, true);
    assert.deepEqual(verdict.reasons, []);
  });

  it('records what every check looked at, and the reference it was compared with', () => {
    const verdict = verify(baseFields, { ...baseCtx, documentName: 'אישור יתרות בנק לאומי ליום 31.12.2025' });
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

  it('fails on wrong type and illegibility, with reasons', () => {
    const verdict = verify({ ...baseFields, is_expected_type: false, legible: false });
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
    const verdict = verify({ ...baseFields, as_of_date: '2025-09-30' });
    assert.equal(verdict.passed, false);
    assert.ok(verdict.reasons[0]!.includes('31.12.2025'));
  });

  it("fails when the document names a different person, passes the client's own", () => {
    assert.equal(verify({ ...baseFields, parties: [owner('משה כהן', null)] }).passed, false);
    assert.equal(verify({ ...baseFields, parties: [owner(null, null)] }).passed, false);
  });

  it('a credential id match vouches for the subject even when the printed name differs', () => {
    const verdict = verify(
      { ...baseFields, parties: [owner('ישראלי אחזקות בע"מ', VALID_ID)] },
      { ...baseCtx, clientName: 'שם שאינו תואם כלל', credentialIdNumber: VALID_ID },
    );
    assert.equal(verdict.passed, true);
  });

  it('a printed id contradicting the credential on file fails for a client registered as not married', () => {
    const verdict = verify(
      { ...baseFields, parties: [owner('ישראל ישראלי', VALID_ID)] },
      { ...baseCtx, credentialIdNumber: '987654321', maritalStatus: 'not_married' },
    );
    assert.equal(verdict.passed, false);
    assert.equal(verdict.adoptSpouse, null);
  });

  it('a printed id contradicting the credential on file is adopted as the spouse when nothing says otherwise', () => {
    // openspec `spouse-identity`: no spouse on file, marital status unknown, checksum-valid → the spouse.
    const verdict = verify(
      { ...baseFields, parties: [owner('רות ישראלי', VALID_ID)] },
      { ...baseCtx, credentialIdNumber: '987654321' },
    );
    assert.equal(verdict.passed, true);
    assert.equal(verdict.subjectMatched, 'spouse');
    assert.deepEqual(verdict.adoptSpouse, { idNumber: VALID_ID, name: 'רות ישראלי' });
    assert.equal(verdict.checks.find((c) => c.key === 'spouse_adopted')?.passed, true);
  });

  it('a type without the subject, date or amount checks (other_assets) still judges every owner id', () => {
    assert.equal(otherAssets.verify({ ...baseFields, as_of_date: null, amounts: [], parties: [owner('משה כהן', null)] }, baseCtx).passed, true);
    const verdict = otherAssets.verify({ ...baseFields, parties: [owner('ישראל ישראלי', '123456783')] }, baseCtx);
    assert.equal(verdict.passed, false);
    assert.deepEqual(verdict.checks.map((c) => c.key), ['legible', 'expected_type', 'id_checksum', 'client_id_on_file']);
  });
});

describe('identityChecks', () => {
  const identity = (fields: ExtractedFields, ctx: CheckContext) => identityChecks(fields, ctx, { subjectMatch: true }).checks;

  it('a printed id missing its leading zero still matches the 9-digit id on file', () => {
    // 012345542 is checksum-valid; banks commonly print it as 12345542.
    const printed = '12345542';
    const checks = identity(
      { ...baseFields, parties: [owner('ישראל ישראלי', printed)] },
      { ...baseCtx, credentialIdNumber: '012345542', credentialIdSource: 'monday_crm' },
    );
    const match = checks.find((c) => c.key === 'id_matches_client')!;
    assert.equal(match.passed, true);
    assert.equal(match.observed, '••••••542');
    assert.equal(match.expected, 'client ••••••542 (monday CRM)');
    assert.equal(checks.find((c) => c.key === 'subject')!.passed, true);
    // The reverse case: the CRM card dropped the zero, the document printed it.
    const reverse = identity({ ...baseFields, parties: [owner('ישראל ישראלי', '012345542')] }, { ...baseCtx, credentialIdNumber: printed });
    assert.equal(reverse.find((c) => c.key === 'id_matches_client')!.passed, true);
  });

  it('a printed id zero-padded to 16 digits matches the 9-digit id on file', () => {
    // Bank Hapoalim mortgage letters print "0000000025699448" for 025699448.
    const verdict = verify(
      { ...baseFields, parties: [owner('ישראל ישראלי', '0000000' + VALID_ID)] },
      { ...baseCtx, credentialIdNumber: VALID_ID, credentialIdSource: 'monday_crm' },
    );
    assert.equal(verdict.checks.find((c) => c.key === 'id_checksum')!.passed, true);
    const match = verdict.checks.find((c) => c.key === 'id_matches_client')!;
    assert.equal(match.passed, true);
    assert.equal(match.observed, '••••••782');
    assert.equal(verdict.checks.find((c) => c.key === 'subject')!.passed, true);
    assert.equal(verdict.passed, true);
  });

  it('id_matches_client names where the id on file came from', () => {
    const fromCrm = identity(
      { ...baseFields, parties: [owner('ישראל ישראלי', VALID_ID)] },
      { ...baseCtx, credentialIdNumber: VALID_ID, credentialIdSource: 'monday_crm' },
    );
    assert.equal(fromCrm.find((c) => c.key === 'id_matches_client')!.expected, 'client ••••••782 (monday CRM)');
    const fromCreds = verify(
      { ...baseFields, parties: [owner('ישראל ישראלי', VALID_ID)] },
      { ...baseCtx, credentialIdNumber: VALID_ID, credentialIdSource: 'credentials' },
    );
    assert.equal(fromCreds.checks.find((c) => c.key === 'id_matches_client')!.expected, 'client ••••••782 (credentials)');
    assert.equal(fromCreds.passed, true);
    assert.equal(fromCreds.checks.some((c) => c.key === 'client_id_on_file'), false);
  });

  it('a printed id with nothing on file reports client_id_on_file without failing the document', () => {
    const verdict = verify({ ...baseFields, parties: [owner('ישראל ישראלי', VALID_ID)] }, { ...baseCtx, credentialIdNumber: null });
    const onFile = verdict.checks.find((c) => c.key === 'client_id_on_file')!;
    assert.equal(onFile.passed, false);
    assert.equal(onFile.observed, 'none');
    assert.match(onFile.reason ?? '', /monday/);
    assert.equal(verdict.checks.some((c) => c.key === 'id_matches_client'), false);
    assert.equal(verdict.passed, true);
    assert.deepEqual(verdict.reasons, []);
    // No id printed on the document: nothing to compare, nothing reported.
    assert.equal(verify(baseFields).checks.some((c) => c.key === 'client_id_on_file'), false);
  });

  it('a printed id never appears unmasked in any check text', () => {
    const checks = identity({ ...baseFields, parties: [owner(null, VALID_ID)] }, { ...baseCtx, clientName: 'שם אחר', credentialIdNumber: VALID_ID });
    const byKey = Object.fromEntries(checks.map((c) => [c.key, c]));
    assert.equal(byKey['subject']!.passed, true);
    assert.equal(byKey['subject']!.observed, 'לא מצוין (••••••782)');
    assert.equal(byKey['id_checksum']!.observed, '••••••782');
    assert.equal(byKey['id_matches_client']!.observed, '••••••782');
    assert.equal(byKey['id_matches_client']!.expected, 'client ••••••782');
    for (const c of checks) {
      for (const s of [c.observed, c.expected, c.reason]) assert.ok(!(s ?? '').includes(VALID_ID), `${c.key}: ${s}`);
    }
  });

  it('an invalid printed id fails even without subjectMatch', () => {
    const { checks, identity: who } = identityChecks({ ...baseFields, parties: [owner('ישראל ישראלי', '123456783')] }, baseCtx, { subjectMatch: false });
    assert.equal(checks.some((c) => c.key === 'subject'), false);
    assert.equal(verdictOf([legibleCheck(baseFields), ...checks], who).passed, false);
  });
});

describe('the single checks', () => {
  it('legible and expected_type', () => {
    assert.deepEqual(legibleCheck(baseFields), { key: 'legible', passed: true, reason: null, observed: 'קריא', expected: null });
    assert.equal(legibleCheck({ ...baseFields, legible: false }).passed, false);
    const type = expectedTypeCheck({ ...baseFields, is_expected_type: false, actual_kind: 'נסח טאבו' }, { ...baseCtx, documentName: 'חוזה רכישה' });
    assert.equal(type.passed, false);
    assert.equal(type.observed, 'נסח טאבו');
    assert.equal(type.expected, 'חוזה רכישה');
    assert.ok(type.reason!.includes('נסח טאבו'));
  });

  it('as_of_date: 31.12 of the tax year exactly', () => {
    assert.equal(asOfDateCheck(baseFields, baseCtx).passed, true);
    const wrong = asOfDateCheck({ ...baseFields, as_of_date: null }, baseCtx);
    assert.equal(wrong.passed, false);
    assert.equal(wrong.observed, 'לא מצוין');
    assert.equal(wrong.expected, '2025-12-31');
  });

  it('amounts: names the exact failing amount and condition, and lists what was found', () => {
    const negative = amountsCheck({ ...baseFields, amounts: [{ label: 'יתרת עו"ש', value: 12_340, currency: 'ILS' }, { label: 'פיקדון', value: -5, currency: 'ILS' }] });
    assert.equal(negative.passed, false);
    assert.equal(negative.observed, 'יתרת עו"ש 12,340 ILS · פיקדון -5 ILS');
    assert.match(negative.reason ?? '', /"פיקדון"/);
    assert.match(negative.reason ?? '', /שלילי/);

    const none = amountsCheck({ ...baseFields, amounts: [] });
    assert.equal(none.passed, false);
    assert.equal(none.observed, 'לא נמצאו סכומים');
    assert.match(none.reason ?? '', /לא זוהו/);

    const huge = amountsCheck({ ...baseFields, amounts: [{ label: 'סה"כ', value: 5e12, currency: 'ILS' }] });
    assert.equal(huge.passed, false);
    assert.match(huge.reason ?? '', /"סה"כ"/);
    assert.match(huge.reason ?? '', /התקרה/);

    const nan = amountsCheck({ ...baseFields, amounts: [{ label: 'x', value: Number.NaN, currency: 'ILS' }] });
    assert.match(nan.reason ?? '', /אינו מספר/);
    // Through the verdict: any of these fails the document.
    assert.equal(verify({ ...baseFields, amounts: [] }).passed, false);
    assert.equal(verify({ ...baseFields, amounts: [{ label: 'x', value: -5, currency: 'ILS' }] }).passed, false);
  });

  it('not_expired: fails a lapsed validity date, passes a future one or the verification day, skips a missing or malformed one', () => {
    // ctx.now is 2026-01-15; a license valid until 2025-07-20 has lapsed.
    const expired = notExpiredCheck({ ...baseFields, valid_until: '2025-07-20' }, baseCtx)!;
    assert.equal(expired.passed, false);
    assert.ok(expired.reason!.includes('2025-07-20'));
    assert.equal(expired.expected, '2026-01-15');
    assert.equal(notExpiredCheck({ ...baseFields, valid_until: '2026-07-20' }, baseCtx)!.passed, true);
    assert.equal(notExpiredCheck({ ...baseFields, valid_until: '2026-01-15' }, baseCtx)!.passed, true);
    assert.equal(notExpiredCheck({ ...baseFields, valid_until: null }, baseCtx), null);
    assert.equal(notExpiredCheck({ ...baseFields, valid_until: '20/07/2025' }, baseCtx), null);
    // A type that does not run the check (loan_taken) ignores a past date entirely.
    assert.equal(verify({ ...baseFields, valid_until: '2020-01-01' }).passed, true);
  });

  it('typeFieldValue normalises by kind: "" and "/" are null, 0 stays 0, numbers in strings parse', () => {
    const plate: TypeField = { key: 'license_plate', kind: 'text', labelHe: 'מספר רישוי', required: false };
    const cost: TypeField = { key: 'purchase_cost', kind: 'number', labelHe: 'עלות', required: false };
    const from: TypeField = { key: 'period_from', kind: 'date', labelHe: 'מ', required: true };
    assert.equal(typeFieldValue({ ...baseFields, license_plate: '' }, plate), null);
    assert.equal(typeFieldValue({ ...baseFields, license_plate: ' 1234567 ' }, plate), '1234567');
    assert.equal(typeFieldValue({ ...baseFields, period_from: '/' }, from), null);
    assert.equal(typeFieldValue({ ...baseFields, purchase_cost: 0 }, cost), 0);
    assert.ok(Number.isNaN(typeFieldValue({ ...baseFields, purchase_cost: '12,000' }, cost)));
    assert.equal(typeFieldValue({ ...baseFields, purchase_cost: '12000' }, cost), 12000);
    assert.equal(typeFieldValue(baseFields, cost), null);
  });

  it('type_fields: observed text is capped at six pairs', () => {
    const many: TypeField[] = Array.from({ length: 8 }, (_, i) => ({ key: `f${i}`, kind: 'text', labelHe: `שדה ${i}`, required: false }));
    const answer = { ...baseFields, ...Object.fromEntries(many.map((f) => [f.key, 'v'])) };
    const check = typeFieldsCheck(answer, baseCtx, many);
    assert.ok(check.observed!.endsWith('(+2)'));
    assert.equal(check.observed!.split(' · ').length, 6);
  });

  it('period_covers_valuation_date: null unless both dates are well formed', () => {
    const fields: TypeField[] = [
      { key: 'period_from', kind: 'date', labelHe: 'מ', required: true },
      { key: 'period_to', kind: 'date', labelHe: 'עד', required: true },
    ];
    assert.equal(periodCoversValuationDateCheck({ ...baseFields, period_from: '2025-03-01', period_to: null }, baseCtx, fields, 'period_from', 'period_to'), null);
    const ok = periodCoversValuationDateCheck({ ...baseFields, period_from: '2025-03-01', period_to: '2026-02-28' }, baseCtx, fields, 'period_from', 'period_to')!;
    assert.equal(ok.passed, true);
    assert.equal(ok.observed, '2025-03-01 – 2026-02-28');
    assert.equal(ok.expected, '2025-12-31');
  });
});

describe('buildExtractionCall', () => {
  it('a row with a paper names the expected paper and its anatomy; a row without one is unchanged (openspec document-papers)', () => {
    const bytes = Buffer.from('%PDF-1.4');
    const contract = buildExtractionCall({
      doc: { name: 'חוזה רכישה — דינוביץ 47', description: null, type_key: 'real_estate', paper_key: 'purchase_contract' },
      bytes,
      contentType: 'application/pdf',
      filename: 'contract.pdf',
      taxYear: 2025,
    });
    assert.ok(contract.systemInstruction!.includes('הנייר המצופה: חוזה רכישה'), contract.systemInstruction);
    assert.ok(contract.systemInstruction!.includes('אינו חוזה רכישה: נסח טאבו'));
    // The paper changes the prompt only; the schema is the type's (real_estate declares typed fields
    // since openspec real-estate-goal-driven-clarification, so it is not the generic schema).
    const schemaProps = (contract.responseJsonSchema as { properties: Record<string, unknown> }).properties;
    assert.ok('seller_kind' in schemaProps && 'purchase_price' in schemaProps);
    assert.ok(contract.systemInstruction!.includes('seller_kind'));
    assert.notEqual(contract.responseJsonSchema, GENERIC_DOCUMENT_TYPE.jsonSchema);
    const noPaper = buildExtractionCall({
      doc: { name: 'חוזה רכישה — הרצל 5', description: null, type_key: 'real_estate', paper_key: null },
      bytes,
      contentType: 'application/pdf',
      filename: 'contract.pdf',
      taxYear: 2025,
    });
    assert.ok(!noPaper.systemInstruction!.includes('הנייר המצופה'));
    const bank = buildExtractionCall({
      doc: { name: 'אישור יתרות בנק לאומי', description: null, type_key: 'bank_balance' },
      bytes,
      contentType: 'application/pdf',
      filename: 'bank.pdf',
      taxYear: 2025,
    });
    assert.ok(!bank.systemInstruction!.includes('הנייר המצופה'));
    assert.ok(!bank.systemInstruction!.includes('{{'));
  });

  it('an untyped row gets the generic prompt and schema; the tax year is rendered everywhere', () => {
    const prior = buildExtractionCall({
      doc: { name: 'מסמך', description: null, type_key: null },
      bytes: Buffer.from('%PDF-1.4'),
      contentType: 'application/pdf',
      filename: 'x.pdf',
      taxYear: 2025,
    });
    assert.equal(prior.responseJsonSchema, GENERIC_DOCUMENT_TYPE.jsonSchema);
    assert.ok(!prior.systemInstruction!.includes('שדות ייעודיים'));
    const bank = buildExtractionCall({
      doc: { name: 'אישור יתרות', description: null, type_key: 'bank_balance' },
      bytes: Buffer.from('%PDF-1.4'),
      contentType: 'application/pdf',
      filename: 'x.pdf',
      taxYear: 2024,
    });
    assert.ok(bank.systemInstruction!.includes('ליום 31.12.2024 (המועד הקובע'));
    assert.ok(!bank.systemInstruction!.includes('{{tax_year}}'));
  });
});
