import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPITAL_DOCUMENT_CATALOG } from '../src/agents/declarationOfCapital/catalog.js';
import { DOCUMENT_TYPES, GENERIC_DOCUMENT_TYPE, documentTypeSpec } from '../src/agents/declarationOfCapital/documentTypes/index.js';
import { buildExtractionCall } from '../src/agents/declarationOfCapital/extractionCall.js';
import { SKIP_REASONS_HE, type CheckContext, type ChecksVerdict, type ExtractedFields } from '../src/agents/declarationOfCapital/verifyChecks.js';

// ---------------------------------------------------------------------------
// The registry guard (openspec `document-extraction`, change
// `per-type-document-schemas`): every catalog type has one module and vice
// versa; every module's schema, prompt and field list agree with each other;
// and the request each module yields equals the captured pre-change request.

const COMMON_KEYS = ['is_expected_type', 'actual_kind', 'issuer', 'parties', 'as_of_date', 'valid_until', 'legible', 'injection_suspected'];
const ALL_MODULES = [...DOCUMENT_TYPES, GENERIC_DOCUMENT_TYPE];
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'extractionCalls');

type JsonObjectSchema = { type: string; properties: Record<string, unknown>; required: string[] };
const objectSchema = (s: Record<string, unknown>) => s as unknown as JsonObjectSchema;

describe('document type registry', () => {
  it('one module per catalog type, in catalog order, and the generic fallback', () => {
    assert.deepEqual(
      DOCUMENT_TYPES.map((t) => t.key),
      CAPITAL_DOCUMENT_CATALOG.map((t) => t.key),
    );
    assert.equal(GENERIC_DOCUMENT_TYPE.key, 'generic');
    assert.ok(!DOCUMENT_TYPES.includes(GENERIC_DOCUMENT_TYPE));
    for (const t of CAPITAL_DOCUMENT_CATALOG) assert.equal(documentTypeSpec(t.key).key, t.key);
    assert.equal(documentTypeSpec(null), GENERIC_DOCUMENT_TYPE);
    assert.equal(documentTypeSpec(undefined), GENERIC_DOCUMENT_TYPE);
    assert.equal(documentTypeSpec('no_such_type'), GENERIC_DOCUMENT_TYPE);
  });

  it('every schema is one flat object: the common fields with the common types, then exactly the declared fields', () => {
    const common = objectSchema(GENERIC_DOCUMENT_TYPE.jsonSchema);
    assert.deepEqual(Object.keys(common.properties), COMMON_KEYS);
    for (const spec of ALL_MODULES) {
      const schema = objectSchema(spec.jsonSchema);
      assert.equal(schema.type, 'object', spec.key);
      assert.ok(!('$schema' in spec.jsonSchema), spec.key);
      const keys = Object.keys(schema.properties);
      assert.deepEqual(keys.slice(0, COMMON_KEYS.length), COMMON_KEYS, `${spec.key}: common fields first`);
      for (const key of COMMON_KEYS) assert.deepEqual(schema.properties[key], common.properties[key], `${spec.key}.${key}: common type`);
      assert.deepEqual(keys.slice(COMMON_KEYS.length), spec.fields.map((f) => f.key), `${spec.key}: extra keys = declared fields`);
      assert.deepEqual(schema.required, keys, `${spec.key}: every key required (nullable, never absent)`);
      for (const f of spec.fields) {
        assert.ok(!COMMON_KEYS.includes(f.key), `${spec.key}.${f.key} collides with a common field`);
        assert.ok(f.labelHe.trim().length > 0, `${spec.key}.${f.key} has no label`);
        if (f.pattern) assert.equal(f.kind, 'text', `${spec.key}.${f.key}: pattern on a non-text field`);
        if (f.min !== undefined) assert.equal(f.kind, 'number', `${spec.key}.${f.key}: min on a non-number field`);
      }
      assert.equal(new Set(spec.fields.map((f) => f.key)).size, spec.fields.length, `${spec.key}: duplicate field key`);
      for (const key of spec.fieldsAnyOf ?? []) assert.ok(spec.fields.some((f) => f.key === key), `${spec.key}: fieldsAnyOf names unknown ${key}`);
    }
  });

  it('every prompt names each key of its schema once, and no key its schema lacks', () => {
    for (const spec of ALL_MODULES) {
      const schemaKeys = Object.keys(objectSchema(spec.jsonSchema).properties);
      const named = [...spec.prompt.matchAll(/^- ([a-z_]+): /gm)].map((m) => m[1]!);
      for (const key of schemaKeys) assert.equal(named.filter((k) => k === key).length, 1, `${spec.key}: prompt must name "${key}" exactly once`);
      for (const key of named) assert.ok(schemaKeys.includes(key), `${spec.key}: prompt names "${key}", which its schema lacks`);
      for (const ph of ['{{expected_name}}', '{{expected_description}}', '{{paper_context}}']) assert.ok(spec.prompt.includes(ph), `${spec.key}: ${ph}`);
    }
  });

  it('the request each module yields equals the request captured before the modules existed', () => {
    const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
    assert.ok(files.length >= ALL_MODULES.length, 'a fixture per module');
    for (const file of files) {
      const fixture = JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), 'utf8')) as {
        doc: { name: string; description: string | null; type_key: string | null; paper_key?: string | null };
        taxYear: number;
        systemInstruction: string;
        responseJsonSchema: Record<string, unknown>;
      };
      const call = buildExtractionCall({
        doc: fixture.doc,
        bytes: Buffer.from('%PDF-1.4'),
        contentType: 'application/pdf',
        filename: 'sample.pdf',
        taxYear: fixture.taxYear,
      });
      assert.equal(call.systemInstruction, fixture.systemInstruction, file);
      assert.deepEqual(call.responseJsonSchema, fixture.responseJsonSchema, file);
    }
  });

  it('parses an answer through the type schema and keeps the base keys typed', () => {
    const vehicle = documentTypeSpec('vehicle');
    const parsed = vehicle.schema.parse({ ...baseFields, license_plate: '1234567', manufacturer: 'טויוטה', model: 'קורולה', production_year: 2019, purchase_cost: null });
    assert.equal(parsed.legible, true);
    assert.equal(parsed['license_plate'], '1234567');
    assert.throws(() => vehicle.schema.parse({ ...baseFields, production_year: 'x' }));
    assert.throws(() => vehicle.schema.parse({ ...baseFields }), 'the extra keys are required (nullable, never absent)');
  });
});

// ---------------------------------------------------------------------------
// Per-type scenarios: each module's own verify over a model answer.

const baseFields: ExtractedFields = {
  is_expected_type: true,
  actual_kind: 'אישור יתרות מבנק לאומי',
  issuer: 'בנק לאומי',
  parties: [{ name: 'ישראל ישראלי', id_number: null, role: 'owner' }],
  as_of_date: '2025-12-31',
  valid_until: null,
  legible: true,
  injection_suspected: false,
};

const baseCtx: CheckContext = {
  clientName: 'ישראל ישראלי',
  credentialIdNumber: null,
  taxYear: 2025,
  now: new Date('2026-01-15T10:00:00'),
};

const typeFieldsOf = (verdict: ChecksVerdict) => verdict.checks.find((c) => c.key === 'type_fields')!;
const periodOf = (verdict: ChecksVerdict) => verdict.checks.find((c) => c.key === 'period_covers_valuation_date');

describe('which checks each type runs', () => {
  it('bank_balance: legible, expected type, owner, as-of date, typed fields — no amounts, no expiry, no period', () => {
    const bank = documentTypeSpec('bank_balance');
    const keys = bank.verify({ ...baseFields, account_number: '12-345-678901', current_account_balance: 4_521, deposits_balance: null }, baseCtx).checks.map((c) => c.key);
    assert.deepEqual(keys, ['legible', 'expected_type', 'subject', 'id_checksum', 'id_matches_client', 'client_id_on_file', 'spouse_adopted', 'co_owners', 'as_of_date', 'type_fields']);
  });

  it('a type with no fields yields neither type_fields nor the period check', () => {
    const keys = documentTypeSpec('business_ownership').verify(baseFields, baseCtx).checks.map((c) => c.key);
    assert.ok(!keys.includes('type_fields'));
    assert.ok(!keys.includes('period_covers_valuation_date'));
    assert.deepEqual(documentTypeSpec('prior_declaration').verify(baseFields, baseCtx).checks.map((c) => c.key), ['legible', 'expected_type', 'subject', 'id_checksum', 'id_matches_client', 'client_id_on_file', 'spouse_adopted', 'co_owners']);
  });

  it('the generic type: common fields only, owner ids judged but the client need not be named', () => {
    const generic = GENERIC_DOCUMENT_TYPE;
    assert.deepEqual(generic.fields, []);
    const verdict = generic.verify({ ...baseFields, parties: [{ name: 'מישהו אחר', id_number: null, role: 'owner' }], as_of_date: null }, baseCtx);
    assert.equal(verdict.passed, true);
    assert.deepEqual(verdict.checks.map((c) => c.key), ['legible', 'expected_type', 'id_checksum', 'id_matches_client', 'client_id_on_file', 'spouse_adopted', 'co_owners']);
    assert.ok(verdict.checks.slice(2).every((c) => c.passed === null), 'no owner id: every identity entry is skipped');
  });

  it('crypto and poa_account do not require the client as the owner; other_assets checks nothing beyond the ids', () => {
    const stranger = { ...baseFields, parties: [{ name: 'מישהו אחר', id_number: null, role: 'owner' as const }] };
    const coins = { ...stranger, market_value: 3_120.55, value_currency: 'USD' };
    assert.equal(documentTypeSpec('crypto').verify(coins, baseCtx).passed, true);
    assert.equal(documentTypeSpec('crypto').verify({ ...coins, as_of_date: null }, baseCtx).passed, false);
    assert.equal(documentTypeSpec('poa_account').verify({ ...stranger, as_of_date: null }, baseCtx).passed, true);
    assert.equal(documentTypeSpec('other_assets').verify({ ...stranger, as_of_date: null }, baseCtx).passed, true);
    assert.equal(documentTypeSpec('loan_given').verify({ ...baseFields, as_of_date: null, borrower_name: null, debt_balance: 40_000 }, baseCtx).passed, true, 'loan_given: no as-of date required');
  });
});

describe('vehicle', () => {
  const vehicle = documentTypeSpec('vehicle');
  const licence = {
    ...baseFields,
    as_of_date: null,
    valid_until: '2026-08-01',
    license_plate: '1234567',
    manufacturer: 'טויוטה',
    model: 'קורולה',
    production_year: 2019,
    purchase_cost: null,
  };

  it('a licence passes on its plate, a receipt on its cost, neither fails the group', () => {
    assert.equal(vehicle.verify(licence, baseCtx).passed, true);
    const receipt = { ...licence, valid_until: null, license_plate: null, manufacturer: null, model: null, production_year: null, purchase_cost: 95_000 };
    assert.equal(typeFieldsOf(vehicle.verify(receipt, baseCtx)).passed, true);
    const neither = typeFieldsOf(vehicle.verify({ ...receipt, purchase_cost: null }, baseCtx));
    assert.equal(neither.passed, false);
    assert.ok(neither.reason!.includes('אף אחד מהשדות "מספר רישוי" / "עלות הרכישה" לא נמצא'));
  });

  it('any licence passes whatever its validity date; the type runs no not_expired check', () => {
    // openspec vehicle-license-optional: the licence is helpful, not required — a licence that
    // expired in 2022 is accepted for the 2025 declaration, and no not_expired row is reported.
    for (const validUntil of ['2022-04-22', '2025-07-20', '2026-01-15', null]) {
      const verdict = vehicle.verify({ ...licence, valid_until: validUntil }, baseCtx);
      assert.equal(verdict.passed, true, String(validUntil));
      assert.equal(verdict.checks.find((c) => c.key === 'not_expired'), undefined);
    }
    const receipt = vehicle.verify({ ...licence, valid_until: null, license_plate: null, purchase_cost: 95_000 }, baseCtx);
    assert.equal(receipt.passed, true);
  });

  it('malformed values fail with the right note: implausible year, plate pattern', () => {
    const badYear = typeFieldsOf(vehicle.verify({ ...licence, production_year: 1900 }, baseCtx));
    assert.ok(badYear.reason!.includes('"שנת ייצור" אינו שנה סבירה'));
    assert.equal(typeFieldsOf(vehicle.verify({ ...licence, production_year: 2026 }, baseCtx)).passed, true);
    assert.equal(typeFieldsOf(vehicle.verify({ ...licence, production_year: 2027 }, baseCtx)).passed, false);
    const plate = typeFieldsOf(vehicle.verify({ ...licence, license_plate: '12-345-67' }, baseCtx));
    assert.equal(plate.passed, false);
    assert.equal(plate.reason, 'מספר הרישוי חייב להכיל 7 או 8 ספרות בלבד');
  });
});

describe('contents_insurance', () => {
  const contents = documentTypeSpec('contents_insurance');
  const goodPolicy = {
    ...baseFields,
    as_of_date: null,
    policy_number: '12345',
    contents_sum: 180_000,
    period_from: '2025-03-01',
    period_to: '2026-02-28',
  };

  it('passes a complete policy and lists every field by label', () => {
    const verdict = contents.verify(goodPolicy, baseCtx);
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
    // A past validity date is ignored: the type runs no not_expired check.
    assert.equal(contents.verify({ ...goodPolicy, valid_until: '2020-01-01' }, baseCtx).passed, true);
  });

  it('a required field that is null fails with its label; an optional null does not', () => {
    const verdict = contents.verify({ ...goodPolicy, contents_sum: null, policy_number: null }, baseCtx);
    const typeFields = typeFieldsOf(verdict);
    assert.equal(typeFields.passed, false);
    assert.ok(typeFields.reason!.includes('"סכום ביטוח התכולה" לא נמצא'));
    assert.ok(typeFields.observed!.includes('מספר פוליסה: לא נמצא'));
    assert.equal(verdict.passed, false);
    // The period is still judged (both dates were read).
    assert.equal(periodOf(verdict)!.passed, true);
  });

  it('period that ends before 31.12 fails period_covers_valuation_date', () => {
    const verdict = contents.verify({ ...goodPolicy, period_from: '2025-01-01', period_to: '2025-11-30' }, baseCtx);
    const period = periodOf(verdict)!;
    assert.equal(period.passed, false);
    assert.equal(period.observed, '2025-01-01 – 2025-11-30');
    assert.equal(period.expected, '2025-12-31');
    assert.ok(period.reason!.includes('אינה כוללת את יום 31.12.2025'));
    assert.equal(typeFieldsOf(verdict).passed, true);
    assert.equal(verdict.passed, false);
    // A period starting after the date fails too; a missing date skips the period check.
    assert.equal(periodOf(contents.verify({ ...goodPolicy, period_from: '2026-01-01', period_to: '2026-12-31' }, baseCtx))!.passed, false);
    const unread = contents.verify({ ...goodPolicy, period_to: null }, baseCtx);
    assert.equal(periodOf(unread)!.passed, null);
    assert.equal(periodOf(unread)!.reason, SKIP_REASONS_HE.periodNotRead);
    assert.equal(typeFieldsOf(unread).passed, false);
  });

  it('malformed values fail with the right note: date form, not a number', () => {
    const badDate = typeFieldsOf(contents.verify({ ...goodPolicy, period_to: '28/02/2026' }, baseCtx));
    assert.equal(badDate.passed, false);
    assert.ok(badDate.reason!.includes('"סיום תקופת הביטוח" אינו תאריך'));
    const nan = typeFieldsOf(contents.verify({ ...goodPolicy, contents_sum: Number.NaN }, baseCtx));
    assert.ok(nan.reason!.includes('"סכום ביטוח התכולה" אינו מספר'));
  });
});

describe('the savings family and the bank', () => {
  it('study fund: deposits of 0 satisfy the group; a null fund name fails', () => {
    const studyFund = documentTypeSpec('study_fund');
    const cert = { ...baseFields, fund_name: 'קרן השתלמות אלטשולר שחם', account_number: '778899', closing_balance: null, total_deposits: 0 };
    const ok = typeFieldsOf(studyFund.verify(cert, baseCtx));
    assert.equal(ok.passed, true);
    assert.equal(ok.observed, 'שם הקופה/הקרן: קרן השתלמות אלטשולר שחם · מספר חשבון: 778899 · יתרה ליום 31.12: לא נמצא · סך ההפקדות המצטבר: 0');
    assert.ok(typeFieldsOf(studyFund.verify({ ...cert, fund_name: null }, baseCtx)).reason!.includes('"שם הקופה/הקרן" לא נמצא'));
    const none = typeFieldsOf(studyFund.verify({ ...cert, total_deposits: null }, baseCtx));
    assert.equal(none.passed, false);
    assert.ok(none.reason!.includes('אף אחד מהשדות'));
  });

  it('savings: a report with no member number passes; a bank certificate without an account number still fails', () => {
    // openspec savings-account-number-optional: the Menora pension annual report prints no member number.
    const pension = documentTypeSpec('pension_provident');
    const report = {
      ...baseFields,
      fund_name: 'קרן הפנסיה חדשה מקיפה - "מנורה מבטחים פנסיה"',
      account_number: null,
      closing_balance: 1_134_117,
      total_deposits: 358_133,
    };
    const verdict = pension.verify(report, baseCtx);
    const ok = typeFieldsOf(verdict);
    assert.equal(ok.passed, true);
    assert.ok(ok.observed!.includes('מספר חשבון: לא נמצא'), ok.observed ?? undefined);
    assert.equal(verdict.passed, true);
    assert.ok(typeFieldsOf(pension.verify({ ...report, fund_name: null }, baseCtx)).reason!.includes('"שם הקופה/הקרן" לא נמצא'));

    const bank = documentTypeSpec('bank_balance');
    const noAccount = typeFieldsOf(bank.verify({ ...baseFields, account_number: null, current_account_balance: 4_521, deposits_balance: null }, baseCtx));
    assert.equal(noAccount.passed, false);
    assert.ok(noAccount.reason!.includes('"מספר חשבון" לא נמצא'));
  });

  it('the declared fields: savings types require only the fund name; bank and securities keep the account number required', () => {
    const requiredOf = (key: string) => Object.fromEntries(documentTypeSpec(key).fields.map((f) => [f.key, f.required]));
    for (const key of ['pension_provident', 'study_fund', 'life_insurance_savings']) {
      assert.deepEqual(requiredOf(key), { fund_name: true, account_number: false, closing_balance: false, total_deposits: false }, key);
      assert.deepEqual(documentTypeSpec(key).fieldsAnyOf, ['closing_balance', 'total_deposits'], key);
    }
    assert.deepEqual(requiredOf('bank_balance'), { account_number: true, current_account_balance: true, deposits_balance: false });
    assert.deepEqual(requiredOf('securities_portfolio'), { account_number: true, portfolio_value: true, base_currency: true });
    assert.deepEqual(requiredOf('mortgage_balance'), { loan_number: false, principal_balance: true });
    assert.deepEqual(documentTypeSpec('vehicle').fieldsAnyOf, ['license_plate', 'purchase_cost']);
    assert.deepEqual(
      documentTypeSpec('real_estate').fields.map((f) => f.key),
      ['property_address', 'purchase_price', 'price_currency', 'purchase_year', 'seller_kind'],
    );
    assert.deepEqual(requiredOf('loan_taken'), { lender_name: false, outstanding_balance: true });
    assert.deepEqual(requiredOf('loan_given'), { borrower_name: false, debt_balance: true });
    assert.deepEqual(requiredOf('crypto'), { market_value: true, value_currency: true });
    for (const key of ['business_ownership', 'private_investment', 'poa_account', 'prior_declaration', 'other_assets']) {
      assert.deepEqual(documentTypeSpec(key).fields, [], `${key} declares no fields`);
    }
  });

  it('every number field carries its own bound: none on the bank current account, 0 on holdings and costs, 1 on the insured sum', () => {
    const minOf = (type: string, key: string) => documentTypeSpec(type).fields.find((f) => f.key === key)?.min;
    assert.equal(minOf('bank_balance', 'current_account_balance'), undefined);
    assert.equal(minOf('bank_balance', 'deposits_balance'), 0);
    assert.equal(minOf('securities_portfolio', 'portfolio_value'), 0);
    for (const key of ['pension_provident', 'study_fund', 'life_insurance_savings']) {
      assert.equal(minOf(key, 'closing_balance'), 0, key);
      assert.equal(minOf(key, 'total_deposits'), 0, key);
    }
    assert.equal(minOf('mortgage_balance', 'principal_balance'), 0);
    assert.equal(minOf('loan_taken', 'outstanding_balance'), 0);
    assert.equal(minOf('loan_given', 'debt_balance'), 0);
    assert.equal(minOf('crypto', 'market_value'), 0);
    assert.equal(minOf('vehicle', 'purchase_cost'), 0);
    assert.equal(minOf('real_estate', 'purchase_price'), 0);
    assert.equal(minOf('contents_insurance', 'contents_sum'), 1);
    for (const spec of [...DOCUMENT_TYPES, GENERIC_DOCUMENT_TYPE]) {
      for (const f of spec.fields) if (f.kind === 'number') assert.ok(f.key === 'current_account_balance' || f.min !== undefined, `${spec.key}.${f.key}: a number field without a bound`);
    }
  });

  it('bank: an overdraft passes, a negative deposits balance fails naming the field (openspec per-type-amount-checks)', () => {
    const bank = documentTypeSpec('bank_balance');
    const mizrahi = { ...baseFields, account_number: '431-467792', current_account_balance: -13_685.83, deposits_balance: null };
    const overdraft = bank.verify(mizrahi, baseCtx);
    assert.equal(overdraft.passed, true, overdraft.reasons.join(' | '));
    assert.equal(typeFieldsOf(overdraft).observed, 'מספר חשבון: 431-467792 · יתרת עו"ש ליום 31.12: -13,685.83 · יתרת פיקדונות וחסכונות: לא נמצא');
    assert.ok(!overdraft.checks.some((c) => c.key === 'amounts'));

    const negativeDeposits = bank.verify({ ...mizrahi, current_account_balance: 12_340, deposits_balance: -5 }, baseCtx);
    assert.equal(negativeDeposits.passed, false);
    assert.equal(typeFieldsOf(negativeDeposits).reason, 'השדה "יתרת פיקדונות וחסכונות" שלילי (-5)');
  });

  it('contents_insurance: a zero insured sum fails above-zero', () => {
    const policy = { ...baseFields, as_of_date: null, policy_number: '12345', contents_sum: 0, period_from: '2025-03-01', period_to: '2026-02-28' };
    const verdict = documentTypeSpec('contents_insurance').verify(policy, baseCtx);
    assert.equal(verdict.passed, false);
    assert.equal(typeFieldsOf(verdict).reason, 'השדה "סכום ביטוח התכולה" קטן מ-1 (0)');
  });
});

describe('loan_taken, loan_given and crypto read their money into named fields', () => {
  it('loan_taken: the balance owed is required, the lender optional; the checks are owner, as-of date, type_fields', () => {
    const loan = documentTypeSpec('loan_taken');
    const cert = { ...baseFields, lender_name: 'מקס איט פיננסים', outstanding_balance: 24_310 };
    const ok = loan.verify(cert, baseCtx);
    assert.equal(ok.passed, true, ok.reasons.join(' | '));
    assert.deepEqual(ok.checks.map((c) => c.key), ['legible', 'expected_type', 'subject', 'id_checksum', 'id_matches_client', 'client_id_on_file', 'spouse_adopted', 'co_owners', 'as_of_date', 'type_fields']);
    assert.equal(typeFieldsOf(ok).observed, 'שם המלווה: מקס איט פיננסים · יתרת ההלוואה ליום 31.12: 24,310');
    assert.equal(loan.verify({ ...cert, lender_name: null }, baseCtx).passed, true);
    const missing = loan.verify({ ...cert, outstanding_balance: null }, baseCtx);
    assert.equal(missing.passed, false);
    assert.ok(typeFieldsOf(missing).reason!.includes('"יתרת ההלוואה ליום 31.12" לא נמצא'));
  });

  it('loan_given: the debt balance is required and zero or above; no as-of date check', () => {
    const given = documentTypeSpec('loan_given');
    const agreement = { ...baseFields, as_of_date: null, borrower_name: 'חברת ניב בע"מ', debt_balance: 40_000 };
    const ok = given.verify(agreement, baseCtx);
    assert.equal(ok.passed, true, ok.reasons.join(' | '));
    assert.ok(!ok.checks.some((c) => c.key === 'as_of_date'));
    assert.equal(typeFieldsOf(given.verify({ ...agreement, debt_balance: -1 }, baseCtx)).reason, 'השדה "יתרת החוב ליום 31.12" שלילי (-1)');
    assert.equal(given.verify({ ...agreement, debt_balance: null }, baseCtx).passed, false);
  });

  it('crypto: market value and a three-letter currency code are required', () => {
    const crypto = documentTypeSpec('crypto');
    const statement = { ...baseFields, market_value: 3_120.55, value_currency: 'USD' };
    const ok = crypto.verify(statement, baseCtx);
    assert.equal(ok.passed, true, ok.reasons.join(' | '));
    assert.equal(typeFieldsOf(ok).observed, 'שווי השוק ליום 31.12: 3,120.55 · מטבע השווי: USD');
    const bad = crypto.verify({ ...statement, value_currency: 'dollars' }, baseCtx);
    assert.equal(bad.passed, false);
    assert.equal(typeFieldsOf(bad).reason, 'מטבע השווי חייב להיות קוד מטבע בן שלוש אותיות (ILS, USD)');
    assert.equal(crypto.verify({ ...statement, market_value: null }, baseCtx).passed, false);
  });
});
