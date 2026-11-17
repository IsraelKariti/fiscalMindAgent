import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { deltaTone, formatDelta, formatShare, formatTokens, pageOf, readStoredFilters, writeStoredFilters } from '../web/src/components/admin/versionCost.js';

// The admin versions page's rendering helpers (openspec `cost-per-version`).

test('formatDelta: arrows, rounding, none', () => {
  assert.equal(formatDelta(-0.25), '▼ 25%');
  assert.equal(formatDelta(0.1), '▲ 10%');
  assert.equal(formatDelta(0.004), '0%');
  assert.equal(formatDelta(null), '');
});

test('deltaTone: a decrease is better, an increase worse', () => {
  assert.equal(deltaTone(-0.25), 'better');
  assert.equal(deltaTone(0.1), 'worse');
  assert.equal(deltaTone(0.001), 'same');
  assert.equal(deltaTone(null), 'none');
});

test('formatTokens and formatShare', () => {
  assert.equal(formatTokens(22_000, 'en-US'), '22,000');
  assert.equal(formatTokens(1234.6, 'en-US'), '1,235');
  assert.equal(formatTokens(null), '—');
  assert.equal(formatShare(0.75), '75%');
  assert.equal(formatShare(null), '—');
});

test('pageOf: 30 at a time, more flag', () => {
  const items = Array.from({ length: 65 }, (_, i) => i);
  assert.deepEqual(pageOf(items, 1).shown.length, 30);
  assert.equal(pageOf(items, 1).more, true);
  assert.equal(pageOf(items, 2).shown.length, 60);
  assert.equal(pageOf(items, 3).shown.length, 65);
  assert.equal(pageOf(items, 3).more, false);
});

test('stored filters: round trip, bad values, no storage', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  writeStoredFilters({ agentInstanceId: 'inst-1', clients: 'test' }, storage);
  assert.deepEqual(readStoredFilters(storage), { agentInstanceId: 'inst-1', clients: 'test' });
  store.set('fm.versions.filters', '{"clients":"bogus","agentInstanceId":""}');
  assert.deepEqual(readStoredFilters(storage), { agentInstanceId: 'all', clients: 'all' });
  store.set('fm.versions.filters', 'not json');
  assert.deepEqual(readStoredFilters(storage), { agentInstanceId: 'all', clients: 'all' });
  assert.deepEqual(readStoredFilters(null), { agentInstanceId: 'all', clients: 'all' });
  assert.doesNotThrow(() => writeStoredFilters({ agentInstanceId: 'all', clients: 'all' }, null));
});
