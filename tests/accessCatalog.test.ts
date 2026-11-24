import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_CATALOG, isBuilt } from '../src/agents/declarationOfCapital/taxFetch/accessCatalog.js';
import { listProviderSpecs } from '../src/agents/declarationOfCapital/taxFetch/providers.js';

// Admin site-access screen (openspec `admin-site-access`): the fixed catalog of
// monitored sites × products, and the built badge read from the provider registry.
describe('access catalog', () => {
  it('lists 9 pension funds, 11 study funds and the tax authority', () => {
    const byGroup = (g: string) => ACCESS_CATALOG.filter((e) => e.group === g);
    assert.equal(byGroup('pension').length, 9);
    assert.equal(byGroup('study_fund').length, 11);
    assert.deepEqual(
      byGroup('other').map((e) => e.site),
      ['israel_tax_authority'],
    );
    assert.equal(ACCESS_CATALOG.length, 21);
    for (const e of ACCESS_CATALOG) assert.ok(e.nameHe.length > 0, `${e.site} has a Hebrew name`);
  });

  it('marks exactly the four existing accesses as built', () => {
    const built = ACCESS_CATALOG.filter(isBuilt).map((e) => `${e.site}/${e.product}`);
    assert.deepEqual(built.sort(), [
      'altshuler_shaham/pension_annual',
      'altshuler_shaham/study_fund_annual',
      'harel/study_fund_annual',
      'israel_tax_authority/form106',
    ]);
  });

  it('every registered provider id is a catalog site (ids must equal institution keys)', () => {
    const sites = new Set(ACCESS_CATALOG.map((e) => e.site));
    for (const p of listProviderSpecs()) assert.ok(sites.has(p.id), `provider ${p.id} missing from the access catalog`);
  });
});
