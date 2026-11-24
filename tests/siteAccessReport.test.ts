import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteAccessReport, healthOf } from '../src/agents/declarationOfCapital/taxFetch/siteAccessReport.js';
import { NO_DOCUMENTS_ERROR_PREFIX } from '../src/agents/declarationOfCapital/taxFetch/types.js';

// Admin site-access screen (openspec `admin-site-access`): counts per site ×
// product and the health rule over the newest finished accesses.
const t = (minutesAgo: number) => new Date(Date.UTC(2026, 10, 24, 12, 0) - minutesAgo * 60_000);
const ok = { status: 'delivered', error: null };
const bad = { status: 'failed', error: 'login failed: selector timed out' };
const noDocs = { status: 'failed', error: `${NO_DOCUMENTS_ERROR_PREFIX}: empty list` };

describe('healthOf', () => {
  it('no finished access → no data', () => assert.equal(healthOf([]), 'no_data'));
  it('last login worked → healthy', () => assert.equal(healthOf([ok, bad, ok]), 'healthy'));
  it('one recent failure → warning', () => assert.equal(healthOf([bad, ok]), 'warning'));
  it('a single failure with nothing before it → warning', () => assert.equal(healthOf([bad]), 'warning'));
  it('two failures in a row → failing', () => assert.equal(healthOf([bad, bad, ok]), 'failing'));
  it('no documents on the site counts as a successful login', () => assert.equal(healthOf([noDocs, bad]), 'healthy'));
});

describe('buildSiteAccessReport', () => {
  const empty = buildSiteAccessReport({ counts: [], recent: [], last: [] });
  const entryOf = (r: ReturnType<typeof buildSiteAccessReport>, group: number, site: string) => {
    const e = r.groups[group]?.entries.find((x) => x.site === site);
    assert.ok(e, `${site} in group ${group}`);
    return e;
  };
  const find = (site: string, product: string) => {
    const e = empty.groups.flatMap((g) => g.entries).find((x) => x.site === site && x.product === product);
    assert.ok(e, `${site}/${product}`);
    return e;
  };

  it('fresh database: 21 cards, zero counts, no data', () => {
    assert.deepEqual(
      empty.groups.map((g) => [g.key, g.size, g.builtCount, g.totalAccesses]),
      [
        ['pension', 9, 6, 0],
        ['study_fund', 11, 6, 0],
        ['other', 1, 1, 0],
      ],
    );
    for (const e of empty.groups.flatMap((g) => g.entries)) {
      assert.deepEqual(e.counts, { total: 0, today: 0, last7: 0, last30: 0 });
      assert.equal(e.health, 'no_data');
      assert.equal(e.last, null);
    }
    assert.equal(find('mor', 'study_fund_annual').built, false);
    assert.equal(find('menora_mivtachim', 'pension_annual').built, true);
    assert.equal(find('menora_mivtachim', 'study_fund_annual').built, true);
    assert.equal(find('meitav', 'pension_annual').built, true);
    assert.equal(find('meitav', 'study_fund_annual').built, true);
    assert.equal(find('harel', 'study_fund_annual').built, true);
    assert.equal(find('harel', 'pension_annual').built, true);
    assert.equal(find('phoenix', 'pension_annual').built, true);
    assert.equal(find('phoenix', 'study_fund_annual').built, true);
    assert.equal(find('migdal', 'pension_annual').built, true);
    assert.equal(find('migdal', 'study_fund_annual').built, true);
  });

  it('an Altshuler session with two keys counts under both products', () => {
    const r = buildSiteAccessReport({
      counts: [
        { provider: 'altshuler_shaham', document_key: 'pension_annual', total: 1, today: 0, last7: 1, last30: 1 },
        { provider: 'altshuler_shaham', document_key: 'study_fund_annual', total: 1, today: 0, last7: 1, last30: 1 },
      ],
      recent: [],
      last: [],
    });
    const pension = entryOf(r, 0, 'altshuler_shaham');
    const study = entryOf(r, 1, 'altshuler_shaham');
    assert.deepEqual(pension.counts, { total: 1, today: 0, last7: 1, last30: 1 });
    assert.deepEqual(study.counts, { total: 1, today: 0, last7: 1, last30: 1 });
    assert.equal(r.groups[0]?.totalAccesses, 1);
    assert.equal(r.groups[1]?.totalAccesses, 1);
  });

  it('a NULL-key bucket spreads over every product the provider offers', () => {
    const r = buildSiteAccessReport({
      counts: [
        { provider: 'israel_tax_authority', document_key: null, total: 3, today: 1, last7: 2, last30: 3 },
        { provider: 'altshuler_shaham', document_key: null, total: 2, today: 0, last7: 0, last30: 2 },
        { provider: 'altshuler_shaham', document_key: 'pension_annual', total: 1, today: 0, last7: 1, last30: 1 },
      ],
      recent: [],
      last: [],
    });
    const tax = entryOf(r, 2, 'israel_tax_authority');
    assert.deepEqual(tax.counts, { total: 3, today: 1, last7: 2, last30: 3 });
    const pension = entryOf(r, 0, 'altshuler_shaham');
    const study = entryOf(r, 1, 'altshuler_shaham');
    assert.equal(pension.counts.total, 3);
    assert.equal(study.counts.total, 2);
  });

  it('health and last access come from the newest rows; abandoned sessions show but do not judge', () => {
    const r = buildSiteAccessReport({
      counts: [],
      recent: [
        { provider: 'harel', document_key: 'study_fund_annual', status: 'failed', error: 'otp rejected too many times', updated_at: t(10) },
        { provider: 'harel', document_key: 'study_fund_annual', status: 'delivered', error: null, updated_at: t(100) },
      ],
      last: [{ id: 'sess-1', provider: 'harel', document_key: 'study_fund_annual', status: 'expired', error: null, updated_at: t(1) }],
    });
    const harel = entryOf(r, 1, 'harel');
    assert.equal(harel.health, 'warning');
    assert.deepEqual(harel.last, { sessionId: 'sess-1', at: t(1).toISOString(), outcome: 'abandoned', error: null });
  });

  it('a failed last access carries its error text', () => {
    const r = buildSiteAccessReport({
      counts: [],
      recent: [{ provider: 'harel', document_key: 'study_fund_annual', status: 'failed', error: 'login failed', updated_at: t(5) }],
      last: [{ id: 'sess-5', provider: 'harel', document_key: 'study_fund_annual', status: 'failed', error: 'login failed', updated_at: t(5) }],
    });
    const harel = entryOf(r, 1, 'harel');
    assert.equal(harel.health, 'warning');
    assert.deepEqual(harel.last, { sessionId: 'sess-5', at: t(5).toISOString(), outcome: 'failed', error: 'login failed' });
  });
});
