import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPITAL_DOCUMENT_CATALOG } from '../src/agents/declarationOfCapital/catalog.js';
import { DOCUMENT_TYPES, GENERIC_DOCUMENT_TYPE, documentTypeSpec } from '../src/agents/declarationOfCapital/documentTypes/index.js';
import { buildExtractionCall } from '../src/agents/declarationOfCapital/extractionCall.js';
import type { CheckContext, ChecksVerdict, ExtractedFields } from '../src/agents/declarationOfCapital/verifyChecks.js';

// ---------------------------------------------------------------------------
// The registry guard (openspec `document-extraction`, change
// `per-type-document-schemas`): every catalog type has one module and vice
// versa; every module's schema, prompt and field list agree with each other;
// and the request each module yields equals the captured pre-change request.

const COMMON_KEYS = ['is_expected_type', 'actual_kind', 'issuer', 'parties', 'as_of_date', 'valid_until', 'amounts', 'legible', 'injection_suspected'];
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
  amounts: [{ label: 'יתרת עו"ש', value: 52_340.55, currency: 'ILS' }],
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
  it('bank_balance: legible, expected type, owner, as-of date, amounts, typed fields — no expiry, no period', () => {
    const bank = documentTypeSpec('bank_balance');
    const keys = bank.verify({ ...baseFields, account_number: '12-345-678901', current_account_balance: 4_521, deposits_balance: null }, baseCtx).checks.map((c) => c.key);
    assert.deepEqual(keys, ['legible', 'expected_type', 'subject', 'as_of_date', 'amounts', 'type_fields']);
  });

  it('a type with no fields yields neither type_fields nor the period check', () => {
    const keys = documentTypeSpec('loan_taken').verify(baseFields, baseCtx).checks.map((c) => c.key);
    assert.ok(!keys.includes('type_fields'));
    assert.ok(!keys.includes('period_covers_valuation_date'));
    assert.deepEqual(documentTypeSpec('prior_declaration').verify(baseFields, baseCtx).checks.map((c) => c.key), ['legible', 'expected_type', 'subject']);
  });

  it('the generic type: common fields only, owner ids judged but the client need not be named', () => {
    const generic = GENERIC_DOCUMENT_TYPE;
    assert.deepEqual(generic.fields, []);
    const verdict = generic.verify({ ...baseFields, parties: [{ name: 'מישהו אחר', id_number: null, role: 'owner' }], as_of_date: null, amounts: [] }, baseCtx);
    assert.equal(verdict.passed, true);
    assert.deepEqual(verdict.checks.map((c) => c.key), ['legible', 'expected_type']);
  });

  it('crypto and poa_account do not require the client as the owner; other_assets checks nothing beyond the ids', () => {
    const stranger = { ...baseFields, parties: [{ name: 'מישהו אחר', id_number: null, role: 'owner' as const }] };
    assert.equal(documentTypeSpec('crypto').verify(stranger, baseCtx).passed, true);
    assert.equal(documentTypeSpec('crypto').verify({ ...stranger, as_of_date: null }, baseCtx).passed, false);
    assert.equal(documentTypeSpec('poa_account').verify({ ...stranger, as_of_date: null, amounts: [] }, baseCtx).passed, true);
    assert.equal(documentTypeSpec('other_assets').verify({ ...stranger, as_of_date: null, amounts: [] }, baseCtx).passed, true);
    assert.equal(documentTypeSpec('loan_given').verify({ ...baseFields, as_of_date: null }, baseCtx).passed, true, 'loan_given: no as-of date required');
  });
});

describe('vehicle', () => {
  const vehicle = documentTypeSpec('vehicle');
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

  it('a licence passes on its plate, a receipt on its cost, neither fails the group', () => {
    assert.equal(vehicle.verify(licence, baseCtx).passed, true);
    const receipt = { ...licence, valid_until: null, license_plate: null, manufacturer: null, model: null, production_year: null, purchase_cost: 95_000 };
    assert.equal(typeFieldsOf(vehicle.verify(receipt, baseCtx)).passed, true);
    const neither = typeFieldsOf(vehicle.verify({ ...receipt, purchase_cost: null }, baseCtx));
    assert.equal(neither.passed, false);
    assert.ok(neither.reason!.includes('אף אחד מהשדות "מספר רישוי" / "עלות הרכישה" לא נמצא'));
  });

  it('an expired licence fails not_expired; a receipt without a validity date skips it', () => {
    // ctx.now is 2026-01-15; a license valid until 2025-07-20 has lapsed.
    const expired = vehicle.verify({ ...licence, valid_until: '2025-07-20' }, baseCtx);
    assert.equal(expired.passed, false);
    assert.ok(expired.reasons[0]!.includes('2025-07-20'));
    assert.equal(vehicle.verify({ ...licence, valid_until: '2026-01-15' }, baseCtx).passed, true);
    assert.equal(vehicle.verify({ ...licence, valid_until: null, license_plate: null, purchase_cost: 95_000 }, baseCtx).checks.some((c) => c.key === 'not_expired'), false);
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
    assert.equal(periodOf(contents.verify({ ...goodPolicy, period_to: null }, baseCtx)), undefined);
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
    for (const key of ['loan_taken', 'loan_given', 'business_ownership', 'crypto', 'private_investment', 'poa_account', 'prior_declaration', 'other_assets']) {
      assert.deepEqual(documentTypeSpec(key).fields, [], `${key} declares no fields`);
    }
  });
});
