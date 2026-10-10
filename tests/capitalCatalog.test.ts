import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPITAL_DOCUMENT_CATALOG,
  CAPITAL_DOCUMENT_PAPER_VALUES,
  catalogSeedRows,
  getCatalogPaper,
  getCatalogType,
  isEmployerBound,
  isInstitutionBound,
  paperBelongsToType,
  papersOf,
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

  it('every type has intake wording', () => {
    for (const type of CAPITAL_DOCUMENT_CATALOG) {
      assert.ok(type.nameHe.length > 0, type.key);
      assert.ok(type.discoveryQuestionHe.endsWith('?'), type.key);
      // A type whose file must state the valuation date is verified on it too.
      if (type.dateDependent) assert.ok(type.nameHe.includes('{{tax_year}}'), type.key);
    }
  });

  it('vehicle carries the licence anatomy hint', () => {
    const vehicle = getCatalogType('vehicle');
    assert.ok(vehicle);
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

  it('exactly the study fund and the pension/provident fund are employer-bound, and both are institution-bound', () => {
    const employerBound = CAPITAL_DOCUMENT_CATALOG.filter((t) => t.employerBound === true).map((t) => t.key);
    assert.deepEqual(employerBound, ['pension_provident', 'study_fund']);
    for (const key of employerBound) assert.equal(isEmployerBound(key), true, key);
    for (const key of employerBound) assert.equal(isInstitutionBound(key), true, key);
    assert.equal(isEmployerBound('life_insurance_savings'), false);
    assert.equal(isEmployerBound('bank_balance'), false);
    assert.equal(isEmployerBound(null), false);
    assert.equal(isEmployerBound('no_such_type'), false);
  });

  it('every type has a short name that states no date or year', () => {
    for (const type of CAPITAL_DOCUMENT_CATALOG) {
      assert.ok(type.shortNameHe.trim().length > 0, type.key);
      assert.ok(!/\d/.test(type.shortNameHe), type.key);
      assert.ok(!type.shortNameHe.includes('{{'), type.key);
    }
  });

  it('papers: keys unique across the catalog, each belongs to exactly one type, short names carry no date', () => {
    const all = CAPITAL_DOCUMENT_CATALOG.flatMap((t) => (t.papers ?? []).map((p) => ({ type: t.key, paper: p })));
    const keys = all.map((p) => p.paper.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual([...CAPITAL_DOCUMENT_PAPER_VALUES].sort(), [...keys].sort());
    for (const { type, paper } of all) {
      assert.equal(getCatalogPaper(paper.key), paper);
      assert.equal(paperBelongsToType(paper.key, type), true);
      for (const other of CAPITAL_DOCUMENT_CATALOG) if (other.key !== type) assert.equal(paperBelongsToType(paper.key, other.key), false);
      assert.ok(paper.shortNameHe.trim().length > 0, paper.key);
      assert.ok(!/\d/.test(paper.shortNameHe), paper.key);
      assert.ok(!keys.includes(type), `paper key ${paper.key} collides with a type key`);
    }
    assert.equal(getCatalogPaper('no_such_paper'), undefined);
    assert.equal(paperBelongsToType(null, 'real_estate'), false);
  });

  it('real_estate declares the seven property papers and no other type declares papers yet', () => {
    assert.deepEqual(
      papersOf('real_estate').map((p) => p.key),
      [
        'purchase_contract',
        'payments_appendix',
        'tabu_extract',
        'purchase_tax_assessment',
        'cost_declaration',
        'inheritance_order',
        'builder_payments_report',
      ],
    );
    for (const p of papersOf('real_estate')) assert.ok(p.analysisHintHe && p.analysisHintHe.length > 40, p.key);
    assert.deepEqual(papersOf('bank_balance'), []);
    assert.deepEqual(papersOf(null), []);
    assert.equal(CAPITAL_DOCUMENT_CATALOG.filter((t) => t.papers).length, 1);
  });
});
