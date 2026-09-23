import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPITAL_DOCUMENT_CATALOG,
  catalogSeedRows,
  getCatalogType,
} from '../src/agents/declarationOfCapital/catalog.js';

describe('capital-declaration catalog', () => {
  it('keys are unique and resolvable', () => {
    const keys = CAPITAL_DOCUMENT_CATALOG.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of keys) assert.ok(getCatalogType(key));
    assert.equal(getCatalogType('no_such_type'), undefined);
  });

  it('carries the liability-shield catch-all', () => {
    const catchAll = getCatalogType('other_assets');
    assert.ok(catchAll);
    assert.equal(catchAll!.multiInstance, true);
  });

  it('every type has intake wording and check config', () => {
    for (const type of CAPITAL_DOCUMENT_CATALOG) {
      assert.ok(type.nameHe.length > 0, type.key);
      assert.ok(type.discoveryQuestionHe.endsWith('?'), type.key);
      assert.ok(typeof type.checks.subjectMatch === 'boolean', type.key);
      // A type whose file must state the valuation date is verified on it too.
      if (type.dateDependent) assert.ok(type.nameHe.includes('{{tax_year}}'), type.key);
    }
  });

  it('vehicle carries the license validity check and the anatomy hint', () => {
    const vehicle = getCatalogType('vehicle');
    assert.ok(vehicle);
    assert.equal(vehicle!.checks.notExpired, true);
    assert.ok(vehicle!.analysisHintHe && vehicle!.analysisHintHe.includes('בתוקף עד'));
  });

  it('savings family carries the certificate anatomy hint and the child-savings exemption', () => {
    for (const key of ['pension_provident', 'study_fund']) {
      const t = getCatalogType(key);
      assert.ok(t);
      assert.ok(t!.analysisHintHe && t!.analysisHintHe.includes('אישור מס להצהרת הון'));
    }
    const pension = getCatalogType('pension_provident');
    assert.ok(pension!.descriptionHe.includes('חיסכון לכל ילד'));
    const insurance = getCatalogType('life_insurance_savings');
    assert.ok(insurance);
    assert.ok(insurance!.descriptionHe.includes('אישור ייעודי להצהרת הון'));
  });

  it('seed rows render {{tax_year}} everywhere and cover the whole catalog', () => {
    const rows = catalogSeedRows(2025);
    assert.equal(rows.length, CAPITAL_DOCUMENT_CATALOG.length);
    for (const row of rows) {
      assert.ok(!row.name.includes('{{'), row.typeKey);
      assert.ok(!row.description.includes('{{'), row.typeKey);
    }
    assert.ok(rows.some((r) => r.name.includes('31.12.2025')));
  });

  it('typed extraction fields: unique keys off the common set, labels and instructions, valid groups', () => {
    const BASE_KEYS = new Set([
      'is_expected_type',
      'actual_kind',
      'issuer',
      'subject_name',
      'subject_id_number',
      'as_of_date',
      'valid_until',
      'amounts',
      'legible',
      'injection_suspected',
    ]);
    for (const type of CAPITAL_DOCUMENT_CATALOG) {
      const fields = type.fields ?? [];
      const keys = fields.map((f) => f.key);
      assert.equal(new Set(keys).size, keys.length, `${type.key}: duplicate field key`);
      for (const f of fields) {
        assert.ok(!BASE_KEYS.has(f.key), `${type.key}.${f.key} collides with a common field`);
        assert.ok(f.labelHe.trim().length > 0, `${type.key}.${f.key} has no label`);
        assert.ok(f.promptHe.trim().length > 0, `${type.key}.${f.key} has no instruction`);
        if (f.pattern) assert.equal(f.kind, 'text', `${type.key}.${f.key}: pattern on a non-text field`);
      }
      for (const key of type.fieldsAnyOf ?? []) assert.ok(keys.includes(key), `${type.key}: fieldsAnyOf names unknown ${key}`);
      const period = type.checks.periodCoversValuationDate;
      if (period) {
        for (const key of [period.from, period.to]) {
          const field = fields.find((f) => f.key === key);
          assert.ok(field && field.kind === 'date', `${type.key}: period field ${key} is not a declared date field`);
        }
      }
    }
  });

  it('the first set of typed fields is declared and the other types stay on the base schema', () => {
    const typed: Record<string, string[]> = {
      bank_balance: ['account_number', 'current_account_balance', 'deposits_balance'],
      securities_portfolio: ['account_number', 'portfolio_value', 'base_currency'],
      pension_provident: ['fund_name', 'account_number', 'closing_balance', 'total_deposits'],
      study_fund: ['fund_name', 'account_number', 'closing_balance', 'total_deposits'],
      life_insurance_savings: ['fund_name', 'account_number', 'closing_balance', 'total_deposits'],
      mortgage_balance: ['loan_number', 'principal_balance'],
      vehicle: ['license_plate', 'manufacturer', 'model', 'production_year', 'purchase_cost'],
      contents_insurance: ['policy_number', 'contents_sum', 'period_from', 'period_to'],
    };
    for (const type of CAPITAL_DOCUMENT_CATALOG) {
      const expected = typed[type.key];
      if (expected) assert.deepEqual((type.fields ?? []).map((f) => f.key), expected, type.key);
      else assert.equal(type.fields, undefined, `${type.key} should declare no fields`);
    }
    assert.deepEqual(getCatalogType('vehicle')!.fieldsAnyOf, ['license_plate', 'purchase_cost']);
    assert.deepEqual(getCatalogType('study_fund')!.fieldsAnyOf, ['closing_balance', 'total_deposits']);
    assert.deepEqual(getCatalogType('contents_insurance')!.checks.periodCoversValuationDate, { from: 'period_from', to: 'period_to' });
    assert.ok(getCatalogType('vehicle')!.fields!.find((f) => f.key === 'license_plate')!.pattern!.test('1234567'));
  });

  it('every type has a short name that states no date or year', () => {
    for (const type of CAPITAL_DOCUMENT_CATALOG) {
      assert.ok(type.shortNameHe.trim().length > 0, type.key);
      assert.ok(!/\d/.test(type.shortNameHe), type.key);
      assert.ok(!type.shortNameHe.includes('{{'), type.key);
    }
  });
});
