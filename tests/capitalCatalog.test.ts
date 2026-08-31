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
});
