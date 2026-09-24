import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractionJsonSchema,
  extractionJsonSchemaFor,
  extractionSchemaFor,
  isValidIsraeliId,
  namesLooselyMatch,
  runChecks,
  typeFieldValue,
  typeFieldsPromptBlock,
  type CheckContext,
  type ExtractedFields,
} from '../src/agents/declarationOfCapital/verifyChecks.js';
import { getCatalogType } from '../src/agents/declarationOfCapital/catalog.js';
import { buildExtractionCall } from '../src/agents/declarationOfCapital/extractionCall.js';

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

  it('a printed id missing its leading zero still matches the 9-digit id on file', () => {
    // 012345542 is checksum-valid; banks commonly print it as 12345542.
    const printed = '12345542';
    const verdict = runChecks(
      { ...baseFields, subject_id_number: printed },
      { ...baseCtx, credentialIdNumber: '012345542', credentialIdSource: 'monday_crm' },
    );
    const match = verdict.checks.find((c) => c.key === 'id_matches_client')!;
    assert.equal(match.passed, true);
    assert.equal(match.observed, '••••••542');
    assert.equal(match.expected, 'client ••••••542 (monday CRM)');
    assert.equal(verdict.checks.find((c) => c.key === 'subject')!.passed, true);
    // The reverse case: the CRM card dropped the zero, the document printed it.
    const reverse = runChecks(
      { ...baseFields, subject_id_number: '012345542' },
      { ...baseCtx, credentialIdNumber: printed },
    );
    assert.equal(reverse.checks.find((c) => c.key === 'id_matches_client')!.passed, true);
  });

  it('id_matches_client names where the id on file came from', () => {
    const fromCrm = runChecks(
      { ...baseFields, subject_id_number: VALID_ID },
      { ...baseCtx, credentialIdNumber: VALID_ID, credentialIdSource: 'monday_crm' },
    );
    assert.equal(fromCrm.checks.find((c) => c.key === 'id_matches_client')!.expected, 'client ••••••782 (monday CRM)');
    const fromCreds = runChecks(
      { ...baseFields, subject_id_number: VALID_ID },
      { ...baseCtx, credentialIdNumber: VALID_ID, credentialIdSource: 'credentials' },
    );
    assert.equal(fromCreds.checks.find((c) => c.key === 'id_matches_client')!.expected, 'client ••••••782 (credentials)');
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
    assert.equal(byKey['id_matches_client']!.expected, 'client ••••••782');
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

  it('a printed id contradicting the credential on file fails for a client registered as not married', () => {
    const verdict = runChecks(
      { ...baseFields, subject_id_number: VALID_ID },
      { ...baseCtx, credentialIdNumber: '987654321', maritalStatus: 'not_married' },
    );
    assert.equal(verdict.passed, false);
    assert.equal(verdict.adoptSpouse, null);
  });

  it('a printed id contradicting the credential on file is adopted as the spouse when nothing says otherwise', () => {
    // openspec `spouse-identity`: no spouse on file, marital status unknown, checksum-valid → the spouse.
    const verdict = runChecks(
      { ...baseFields, subject_name: 'רות ישראלי', subject_id_number: VALID_ID },
      { ...baseCtx, credentialIdNumber: '987654321' },
    );
    assert.equal(verdict.passed, true);
    assert.equal(verdict.subjectMatched, 'spouse');
    assert.deepEqual(verdict.adoptSpouse, { idNumber: VALID_ID, name: 'רות ישראלי' });
    assert.equal(verdict.checks.find((c) => c.key === 'spouse_adopted')?.passed, true);
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

// ---------------------------------------------------------------------------
// Type-specific extraction fields (openspec `document-extraction`)

const vehicle = getCatalogType('vehicle')!;
const contents = getCatalogType('contents_insurance')!;
const studyFund = getCatalogType('study_fund')!;

describe('extraction schema and prompt from the type declaration', () => {
  it('no fields: the base JSON schema object itself', () => {
    assert.equal(extractionJsonSchemaFor(undefined), extractionJsonSchema);
    assert.equal(extractionJsonSchemaFor([]), extractionJsonSchema);
  });

  it('vehicle: the five keys are nullable properties beside the common ones', () => {
    type Prop = { type?: string[]; anyOf?: { type: string }[] };
    const schema = extractionJsonSchemaFor(vehicle.fields) as { properties: Record<string, Prop>; required: string[] };
    const allowsNull = (p: Prop) => p.type?.includes('null') || p.anyOf?.some((a) => a.type === 'null') || false;
    for (const key of ['license_plate', 'manufacturer', 'model', 'production_year', 'purchase_cost']) {
      assert.ok(schema.properties[key], key);
      assert.ok(allowsNull(schema.properties[key]!), key);
      assert.ok(schema.required.includes(key), key);
    }
    assert.deepEqual(schema.properties['production_year'], { anyOf: [{ type: 'integer' }, { type: 'null' }] });
    assert.deepEqual(schema.properties['license_plate'], { type: ['string', 'null'] });
    assert.ok(schema.properties['is_expected_type']);
    assert.ok(!('$schema' in schema));
  });

  it('parses an extended answer and keeps the base keys typed', () => {
    const parsed = extractionSchemaFor(vehicle.fields).parse({
      ...baseFields,
      license_plate: '1234567',
      manufacturer: 'טויוטה',
      model: 'קורולה',
      production_year: 2019,
      purchase_cost: null,
    });
    assert.equal(parsed.legible, true);
    assert.equal(parsed['license_plate'], '1234567');
    assert.throws(() => extractionSchemaFor(vehicle.fields).parse({ ...baseFields, production_year: 'x' }));
  });

  it('typeFieldValue normalises by kind: "" and "/" are null, 0 stays 0, numbers in strings parse', () => {
    const plate = vehicle.fields!.find((f) => f.key === 'license_plate')!;
    const cost = vehicle.fields!.find((f) => f.key === 'purchase_cost')!;
    const from = contents.fields!.find((f) => f.key === 'period_from')!;
    assert.equal(typeFieldValue({ ...baseFields, license_plate: '' } as never, plate), null);
    assert.equal(typeFieldValue({ ...baseFields, license_plate: ' 1234567 ' } as never, plate), '1234567');
    assert.equal(typeFieldValue({ ...baseFields, period_from: '/' } as never, from), null);
    assert.equal(typeFieldValue({ ...baseFields, purchase_cost: 0 } as never, cost), 0);
    assert.ok(Number.isNaN(typeFieldValue({ ...baseFields, purchase_cost: '12,000' } as never, cost)));
    assert.equal(typeFieldValue({ ...baseFields, purchase_cost: '12000' } as never, cost), 12000);
    assert.equal(typeFieldValue(baseFields, cost), null);
  });

  it('prompt block: one line per field plus the "at least one" line; empty when no fields', () => {
    assert.equal(typeFieldsPromptBlock(undefined), '');
    const block = typeFieldsPromptBlock(vehicle.fields, vehicle.fieldsAnyOf);
    const lines = block.split('\n').filter((l) => l.startsWith('- '));
    assert.deepEqual(
      lines.map((l) => l.slice(2, l.indexOf(':'))),
      ['license_plate', 'manufacturer', 'model', 'production_year', 'purchase_cost'],
    );
    assert.ok(block.includes('לפחות אחד מהשדות license_plate / purchase_cost'));
    assert.ok(!typeFieldsPromptBlock(contents.fields).includes('לפחות אחד'));
  });

  it('buildExtractionCall: untyped row unchanged, vehicle row carries the lines and the extended schema', () => {
    const bytes = Buffer.from('%PDF-1.4');
    const prior = buildExtractionCall({
      doc: { name: 'הצהרת הון קודמת', description: null, type_key: 'prior_declaration' },
      bytes,
      contentType: 'application/pdf',
      filename: 'prior.pdf',
      taxYear: 2025,
    });
    assert.equal(prior.responseJsonSchema, extractionJsonSchema);
    assert.ok(!prior.systemInstruction!.includes('שדות ייעודיים'));

    const car = buildExtractionCall({
      doc: { name: 'העתק רישיון רכב בתוקף', description: null, type_key: 'vehicle' },
      bytes,
      contentType: 'application/pdf',
      filename: 'car.pdf',
      taxYear: 2025,
    });
    for (const key of ['license_plate', 'manufacturer', 'model', 'production_year', 'purchase_cost']) {
      assert.ok(car.systemInstruction!.includes(`- ${key}: `), key);
      assert.ok((car.responseJsonSchema as { properties: Record<string, unknown> }).properties[key], key);
    }
  });
});

describe('runChecks: type_fields and period_covers_valuation_date', () => {
  const contentsCtx: CheckContext = {
    ...baseCtx,
    checks: contents.checks,
    fields: contents.fields,
    fieldsAnyOf: contents.fieldsAnyOf,
  };
  const goodPolicy = {
    ...baseFields,
    as_of_date: null,
    policy_number: '12345',
    contents_sum: 180_000,
    period_from: '2025-03-01',
    period_to: '2026-02-28',
  };
  const vehicleCtx: CheckContext = {
    ...baseCtx,
    checks: vehicle.checks,
    fields: vehicle.fields,
    fieldsAnyOf: vehicle.fieldsAnyOf,
  };
  const licence = {
    ...baseFields,
    as_of_date: null,
    valid_until: '2026-08-01',
    amounts: [],
    license_plate: '1234567',
    manufacturer: 'טויוטה',
    model: 'קורולה',
    production_year: 2019,
    purchase_cost: null,
  };
  const typeFieldsOf = (verdict: ReturnType<typeof runChecks>) => verdict.checks.find((c) => c.key === 'type_fields')!;
  const periodOf = (verdict: ReturnType<typeof runChecks>) => verdict.checks.find((c) => c.key === 'period_covers_valuation_date');

  it('a type with no fields yields neither check', () => {
    const keys = runChecks(baseFields, baseCtx).checks.map((c) => c.key);
    assert.ok(!keys.includes('type_fields'));
    assert.ok(!keys.includes('period_covers_valuation_date'));
  });

  it('passes a complete policy and lists every field by label', () => {
    const verdict = runChecks(goodPolicy, contentsCtx);
    const typeFields = typeFieldsOf(verdict);
    assert.equal(typeFields.passed, true);
    assert.equal(
      typeFields.observed,
      'מספר פוליסה: 12345 · סכום ביטוח התכולה: 180,000 · תחילת תקופת הביטוח: 2025-03-01 · סיום תקופת הביטוח: 2026-02-28',
    );
    const period = periodOf(verdict)!;
    assert.equal(period.passed, true);
    assert.equal(period.observed, '2025-03-01 – 2026-02-28');
    assert.equal(period.expected, '2025-12-31');
    assert.equal(verdict.passed, true);
  });

  it('a required field that is null fails with its label; an optional null does not', () => {
    const verdict = runChecks({ ...goodPolicy, contents_sum: null, policy_number: null }, contentsCtx);
    const typeFields = typeFieldsOf(verdict);
    assert.equal(typeFields.passed, false);
    assert.ok(typeFields.reason!.includes('"סכום ביטוח התכולה" לא נמצא'));
    assert.ok(typeFields.observed!.includes('מספר פוליסה: לא נמצא'));
    assert.equal(verdict.passed, false);
    // The period is still judged (both dates were read).
    assert.equal(periodOf(verdict)!.passed, true);
  });

  it('period that ends before 31.12 fails period_covers_valuation_date', () => {
    const verdict = runChecks({ ...goodPolicy, period_from: '2025-01-01', period_to: '2025-11-30' }, contentsCtx);
    const period = periodOf(verdict)!;
    assert.equal(period.passed, false);
    assert.equal(period.observed, '2025-01-01 – 2025-11-30');
    assert.equal(period.expected, '2025-12-31');
    assert.ok(period.reason!.includes('אינה כוללת את יום 31.12.2025'));
    assert.equal(typeFieldsOf(verdict).passed, true);
    assert.equal(verdict.passed, false);
    // A period starting after the date fails too; a missing date skips the period check.
    assert.equal(periodOf(runChecks({ ...goodPolicy, period_from: '2026-01-01', period_to: '2026-12-31' }, contentsCtx))!.passed, false);
    assert.equal(periodOf(runChecks({ ...goodPolicy, period_to: null }, contentsCtx)), undefined);
  });

  it('malformed values fail with the right note: date form, implausible year, not a number, plate pattern', () => {
    const badDate = typeFieldsOf(runChecks({ ...goodPolicy, period_to: '28/02/2026' }, contentsCtx));
    assert.equal(badDate.passed, false);
    assert.ok(badDate.reason!.includes('"סיום תקופת הביטוח" אינו תאריך'));

    const badYear = typeFieldsOf(runChecks({ ...licence, production_year: 1900 }, vehicleCtx));
    assert.ok(badYear.reason!.includes('"שנת ייצור" אינו שנה סבירה'));
    assert.equal(typeFieldsOf(runChecks({ ...licence, production_year: 2026 }, vehicleCtx)).passed, true);
    assert.equal(typeFieldsOf(runChecks({ ...licence, production_year: 2027 }, vehicleCtx)).passed, false);

    const nan = typeFieldsOf(runChecks({ ...goodPolicy, contents_sum: Number.NaN }, contentsCtx));
    assert.ok(nan.reason!.includes('"סכום ביטוח התכולה" אינו מספר'));

    const plate = typeFieldsOf(runChecks({ ...licence, license_plate: '12-345-67' }, vehicleCtx));
    assert.equal(plate.passed, false);
    assert.equal(plate.reason, 'מספר הרישוי חייב להכיל 7 או 8 ספרות בלבד');
  });

  it('vehicle: a licence passes on its plate, a receipt on its cost, neither fails the group', () => {
    assert.equal(runChecks(licence, vehicleCtx).passed, true);
    const receipt = { ...licence, valid_until: null, license_plate: null, manufacturer: null, model: null, production_year: null, purchase_cost: 95_000 };
    assert.equal(typeFieldsOf(runChecks(receipt, vehicleCtx)).passed, true);
    const neither = typeFieldsOf(runChecks({ ...receipt, purchase_cost: null }, vehicleCtx));
    assert.equal(neither.passed, false);
    assert.ok(neither.reason!.includes('אף אחד מהשדות "מספר רישוי" / "עלות הרכישה" לא נמצא'));
  });

  it('study fund: deposits of 0 satisfy the group; a null fund name fails', () => {
    const ctx: CheckContext = { ...baseCtx, checks: studyFund.checks, fields: studyFund.fields, fieldsAnyOf: studyFund.fieldsAnyOf };
    const cert = { ...baseFields, fund_name: 'קרן השתלמות אלטשולר שחם', account_number: '778899', closing_balance: null, total_deposits: 0 };
    const ok = typeFieldsOf(runChecks(cert, ctx));
    assert.equal(ok.passed, true);
    assert.equal(ok.observed, 'שם הקופה/הקרן: קרן השתלמות אלטשולר שחם · מספר חשבון: 778899 · יתרה ליום 31.12: לא נמצא · סך ההפקדות המצטבר: 0');
    assert.ok(typeFieldsOf(runChecks({ ...cert, fund_name: null }, ctx)).reason!.includes('"שם הקופה/הקרן" לא נמצא'));
    const none = typeFieldsOf(runChecks({ ...cert, total_deposits: null }, ctx));
    assert.equal(none.passed, false);
    assert.ok(none.reason!.includes('אף אחד מהשדות'));
  });

  it('savings: a report with no member number passes; a bank certificate without an account number still fails', () => {
    // openspec savings-account-number-optional: the Menora pension annual report prints no member number.
    const pension = getCatalogType('pension_provident')!;
    const ctx: CheckContext = { ...baseCtx, checks: pension.checks, fields: pension.fields, fieldsAnyOf: pension.fieldsAnyOf };
    const report = {
      ...baseFields,
      fund_name: 'קרן הפנסיה חדשה מקיפה - "מנורה מבטחים פנסיה"',
      account_number: null,
      closing_balance: 1_134_117,
      total_deposits: 358_133,
    };
    const verdict = runChecks(report, ctx);
    const ok = typeFieldsOf(verdict);
    assert.equal(ok.passed, true);
    assert.ok(ok.observed!.includes('מספר חשבון: לא נמצא'), ok.observed ?? undefined);
    assert.equal(verdict.passed, true);
    assert.ok(typeFieldsOf(runChecks({ ...report, fund_name: null }, ctx)).reason!.includes('"שם הקופה/הקרן" לא נמצא'));

    const bank = getCatalogType('bank_balance')!;
    const bankCtx: CheckContext = { ...baseCtx, checks: bank.checks, fields: bank.fields, fieldsAnyOf: bank.fieldsAnyOf };
    const noAccount = typeFieldsOf(runChecks({ ...baseFields, account_number: null, current_account_balance: 4_521, deposits_balance: null }, bankCtx));
    assert.equal(noAccount.passed, false);
    assert.ok(noAccount.reason!.includes('"מספר חשבון" לא נמצא'));
  });

  it('observed text is capped at six pairs', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ key: `f${i}`, kind: 'text' as const, labelHe: `שדה ${i}`, promptHe: 'x', required: false }));
    const answer = { ...baseFields, ...Object.fromEntries(many.map((f) => [f.key, 'v'])) };
    const check = typeFieldsOf(runChecks(answer, { ...baseCtx, fields: many }));
    assert.ok(check.observed!.endsWith('(+2)'));
    assert.equal(check.observed!.split(' · ').length, 6);
  });
});
