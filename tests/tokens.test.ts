import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fullPriceInputTokens } from '../web/src/components/tokens.js';

// The input tokens every screen shows (openspec `llm-call-cache-usage`).

test('a call that read the cache shows only the tokens billed at the input price', () => {
  assert.equal(fullPriceInputTokens({ inputTokens: 54_193, cachedTokens: 42_768, cacheWriteTokens: 0 }), 11_425);
});

test('a call that wrote the cache leaves the cache-write tokens out', () => {
  assert.equal(fullPriceInputTokens({ inputTokens: 52_000, cachedTokens: 0, cacheWriteTokens: 45_000 }), 7_000);
});

test('a two-turn call subtracts the summed cache tokens', () => {
  assert.equal(fullPriceInputTokens({ inputTokens: 107_138, cachedTokens: 85_536, cacheWriteTokens: 0 }), 21_602);
});

test('a call with no cache keeps its input tokens', () => {
  assert.equal(fullPriceInputTokens({ inputTokens: 9_000, cachedTokens: 0, cacheWriteTokens: 0 }), 9_000);
});

test('a payload with no cache-write count counts it as 0', () => {
  assert.equal(fullPriceInputTokens({ inputTokens: 9_000, cachedTokens: 4_000 }), 5_000);
  assert.equal(fullPriceInputTokens({ inputTokens: 9_000, cachedTokens: 4_000, cacheWriteTokens: null }), 5_000);
});

test('never below 0', () => {
  assert.equal(fullPriceInputTokens({ inputTokens: 100, cachedTokens: 150, cacheWriteTokens: 0 }), 0);
});
