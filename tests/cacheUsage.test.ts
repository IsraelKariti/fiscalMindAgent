import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// openspec `llm-call-cache-usage`: cache-write tokens are a subset of input
// tokens priced at their own rate per lifetime; the Anthropic adapter asks for
// the cache on the system block, splits the provider's usage by lifetime and
// hands the raw usage block through; the tool loop sums the counts and keeps
// one raw block per turn; the usage totals price with the same arithmetic.
// The provider is replaced by a fetch stub; nothing leaves the process.

for (const [key, value] of Object.entries({
  DATABASE_URL: 'postgres://test',
  REDIS_URL: 'redis://test',
  GEMINI_API_KEY: 'test',
  ANTHROPIC_API_KEY: 'test',
  OPENAI_API_KEY: 'test',
  SECRET_ENC_KEY: 'test-secret-enc-key-test-secret-enc-key-test-secret',
  RESEND_API_KEY: 'test',
})) {
  process.env[key] ??= value;
}

const { cacheTtlOf, cacheWriteRate, cacheWriteRatesOf, computeCost } = await import('../src/gemini/cost.js');
const { anthropicUsageMetadata, generateContentAnthropic } = await import('../src/gemini/anthropic.js');
const { generateContentOpenAI } = await import('../src/gemini/openai.js');
const { rawUsageOf, usageFromResponse } = await import('../src/gemini/generate.js');
const { sentCacheTtlOf, sentRequestOf } = await import('../src/gemini/wireRequest.js');
const { runToolLoop } = await import('../src/gemini/toolLoop.js');

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// claude-opus-5: $5 / $25 per million, cache read $0.50, cache write $6.25 (5m) and $10 (1h).
const opus = {
  inputCostPerToken: 5e-6,
  outputCostPerToken: 25e-6,
  thinkingCostPerToken: 25e-6,
  cachedCostPerToken: 0.5e-6,
  cacheWrite5mCostPerToken: 6.25e-6,
  cacheWrite1hCostPerToken: 10e-6,
};

describe('computeCost with cache-write tokens', () => {
  it("the spec's example: 52,000 input of which 45,000 cache-write (5m), 600 output = $0.33125", () => {
    near(computeCost(opus, { inputTokens: 52_000, outputTokens: 600, thinkingTokens: 0, cachedTokens: 0, cacheWrite5mTokens: 45_000 }), 0.33125);
  });

  it('a call with no cache-write tokens costs what it cost before the change', () => {
    const usage = { inputTokens: 52_379, outputTokens: 619, thinkingTokens: 0, cachedTokens: 1_000 };
    const before = (52_379 - 1_000) * 5e-6 + 1_000 * 0.5e-6 + 619 * 25e-6;
    near(computeCost(opus, usage), before);
    near(computeCost(opus, { ...usage, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 }), before);
  });

  it('both lifetimes in one total are each priced at their own rate', () => {
    const cost = computeCost(opus, { inputTokens: 20_000, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0, cacheWrite5mTokens: 10_000, cacheWrite1hTokens: 10_000 });
    near(cost, 10_000 * 6.25e-6 + 10_000 * 10e-6);
  });

  it("a day's total costs the sum of its calls", () => {
    const calls = [
      { inputTokens: 52_000, outputTokens: 600, thinkingTokens: 0, cachedTokens: 0, cacheWrite5mTokens: 45_000, cacheWrite1hTokens: 0 },
      { inputTokens: 52_000, outputTokens: 400, thinkingTokens: 0, cachedTokens: 45_000, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 },
      { inputTokens: 30_000, outputTokens: 100, thinkingTokens: 0, cachedTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 20_000 },
    ];
    const day = calls.reduce(
      (sum, c) => ({
        inputTokens: sum.inputTokens + c.inputTokens,
        outputTokens: sum.outputTokens + c.outputTokens,
        thinkingTokens: 0,
        cachedTokens: sum.cachedTokens + c.cachedTokens,
        cacheWrite5mTokens: sum.cacheWrite5mTokens + c.cacheWrite5mTokens,
        cacheWrite1hTokens: sum.cacheWrite1hTokens + c.cacheWrite1hTokens,
      }),
      { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 },
    );
    near(computeCost(opus, day), calls.reduce((sum, c) => sum + computeCost(opus, c), 0));
  });

  it('rates without cache-write prices fall back to the input rate', () => {
    const bare = { inputCostPerToken: 1e-6, outputCostPerToken: 2e-6, thinkingCostPerToken: 2e-6, cachedCostPerToken: 0.1e-6 };
    assert.equal(cacheWriteRate(bare, '5m'), 1e-6);
    assert.equal(cacheWriteRate(bare, '1h'), 1e-6);
  });
});

describe('cache-write prices of a price-list entry', () => {
  it("the list's own fields win", () => {
    const rates = cacheWriteRatesOf({ cache_creation_input_token_cost: 6.25e-6, cache_creation_input_token_cost_above_1hr: 10e-6 }, 5e-6, 'anthropic');
    assert.deepEqual(rates, { cacheWrite5mCostPerToken: 6.25e-6, cacheWrite1hCostPerToken: 10e-6 });
  });

  it('an Anthropic entry without them gets 1.25x and 2x the input price', () => {
    const rates = cacheWriteRatesOf({}, 4e-6, 'anthropic');
    near(rates.cacheWrite5mCostPerToken, 5e-6);
    near(rates.cacheWrite1hCostPerToken, 8e-6);
  });

  it('another provider without them gets the input price', () => {
    assert.deepEqual(cacheWriteRatesOf({}, 4e-6, 'openai'), { cacheWrite5mCostPerToken: 4e-6, cacheWrite1hCostPerToken: 4e-6 });
  });
});

describe('the cache lifetime setting', () => {
  it('nothing saved, or anything but the two options, is 5 minutes', () => {
    assert.equal(cacheTtlOf(undefined), '5m');
    assert.equal(cacheTtlOf(null), '5m');
    assert.equal(cacheTtlOf('2h'), '5m');
    assert.equal(cacheTtlOf('5m'), '5m');
    assert.equal(cacheTtlOf('1h'), '1h');
  });

  it('only an Anthropic request with system instructions carries a cache request', () => {
    const withSystem = { model: 'm', cacheTtl: '1h' as const, config: { systemInstruction: 'rules' } };
    assert.equal(sentCacheTtlOf('anthropic', withSystem), '1h');
    assert.equal(sentCacheTtlOf('anthropic', { model: 'm', config: { systemInstruction: 'rules' } }), '5m');
    assert.equal(sentCacheTtlOf('anthropic', { model: 'm', cacheTtl: '1h', config: {} }), null);
    assert.equal(sentCacheTtlOf('openai', withSystem), null);
    assert.equal(sentCacheTtlOf('gemini', withSystem), null);
  });

  it('the sent copy of the call row names the cache mark', () => {
    assert.deepEqual(sentRequestOf('anthropic', { model: 'm', cacheTtl: '1h', config: { systemInstruction: 'rules' } })!.cacheControl, { type: 'ephemeral', ttl: '1h' });
    assert.equal(sentRequestOf('anthropic', { model: 'm', config: {} })!.cacheControl, undefined);
    assert.equal(sentRequestOf('openai', { model: 'm', config: { systemInstruction: 'rules' } })!.cacheControl, undefined);
  });
});

describe('Anthropic usage in the call-log convention', () => {
  it('cache-write and cached tokens are counted inside the input tokens', () => {
    const meta = anthropicUsageMetadata({ input_tokens: 7_000, output_tokens: 600, cache_creation_input_tokens: 45_000, cache_read_input_tokens: 0 }, '5m');
    assert.equal(meta.promptTokenCount, 52_000);
    assert.equal(meta.cacheWrite5mTokenCount, 45_000);
    assert.equal(meta.cacheWrite1hTokenCount, 0);
    assert.equal(meta.cachedContentTokenCount, 0);
  });

  it("the provider's breakdown decides the lifetime of the written tokens", () => {
    const meta = anthropicUsageMetadata(
      { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 300, cache_read_input_tokens: 40, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 } },
      '5m',
    );
    assert.equal(meta.cacheWrite5mTokenCount, 100);
    assert.equal(meta.cacheWrite1hTokenCount, 200);
    assert.equal(meta.cachedContentTokenCount, 40);
    assert.equal(meta.promptTokenCount, 350);
  });

  it('without a breakdown the written tokens take the lifetime the request asked for', () => {
    const meta = anthropicUsageMetadata({ input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 300 }, '1h');
    assert.equal(meta.cacheWrite1hTokenCount, 300);
    assert.equal(meta.cacheWrite5mTokenCount, 0);
  });
});

describe('the adapters on the wire', () => {
  const captured: { url: string; body: Record<string, unknown> }[] = [];
  let reply: unknown = {};
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
      captured.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  const anthropicReply = (usage: Record<string, unknown>) => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'm',
    content: [{ type: 'text', text: 'ok' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage,
  });

  it('Anthropic: the system block carries the cache mark with the lifetime; counts and raw usage come back', async () => {
    captured.length = 0;
    const usage = {
      input_tokens: 7_000,
      output_tokens: 600,
      cache_creation_input_tokens: 45_000,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 45_000 },
    };
    reply = anthropicReply(usage);
    const response = await generateContentAnthropic({ model: 'm', contents: 'input', cacheTtl: '1h', config: { systemInstruction: 'the fixed rules', httpOptions: { timeout: 60_000 } } });
    assert.deepEqual(captured[0]!.body.system, [{ type: 'text', text: 'the fixed rules', cache_control: { type: 'ephemeral', ttl: '1h' } }]);
    const counted = usageFromResponse(response);
    assert.equal(counted.inputTokens, 52_000);
    assert.equal(counted.cacheWrite1hTokens, 45_000);
    assert.equal(counted.cacheWrite5mTokens, 0);
    assert.deepEqual(rawUsageOf(response), [usage]);
  });

  it('Anthropic: with nothing set the lifetime is 5 minutes', async () => {
    captured.length = 0;
    reply = anthropicReply({ input_tokens: 5, output_tokens: 3 });
    await generateContentAnthropic({ model: 'm', contents: 'input', config: { systemInstruction: 'the fixed rules', httpOptions: { timeout: 60_000 } } });
    assert.deepEqual(captured[0]!.body.system, [{ type: 'text', text: 'the fixed rules', cache_control: { type: 'ephemeral', ttl: '5m' } }]);
  });

  it('Anthropic: a request with no system instructions carries no cache request', async () => {
    captured.length = 0;
    reply = anthropicReply({ input_tokens: 5, output_tokens: 3 });
    await generateContentAnthropic({ model: 'm', contents: 'input', cacheTtl: '1h', config: { httpOptions: { timeout: 60_000 } } });
    assert.equal('system' in captured[0]!.body, false);
    assert.equal(JSON.stringify(captured[0]!.body).includes('cache_control'), false);
  });

  it('OpenAI: no cache-write tokens, and the raw usage block comes back unchanged', async () => {
    captured.length = 0;
    const usage = { input_tokens: 50, output_tokens: 9, output_tokens_details: { reasoning_tokens: 2 }, input_tokens_details: { cached_tokens: 20 }, total_tokens: 59 };
    reply = { id: 'resp_1', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }], usage };
    const response = await generateContentOpenAI({ model: 'gpt-5', contents: 'input', config: { systemInstruction: 'rules', httpOptions: { timeout: 60_000 } } });
    const counted = usageFromResponse(response);
    assert.equal(counted.cacheWrite5mTokens, 0);
    assert.equal(counted.cacheWrite1hTokens, 0);
    assert.equal(counted.cachedTokens, 20);
    assert.deepEqual(rawUsageOf(response), [usage]);
  });
});

describe('Gemini and failed answers', () => {
  it("a Gemini answer's raw usage is its own usageMetadata", () => {
    const usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 };
    assert.deepEqual(rawUsageOf({ usageMetadata } as never), [usageMetadata]);
    assert.equal(usageFromResponse({ usageMetadata } as never).cacheWrite5mTokens, 0);
  });

  it('an answer with no usage has no raw usage', () => {
    assert.equal(rawUsageOf({} as never), null);
    assert.equal(rawUsageOf({ rawUsage: [] } as never), null);
  });
});

describe('the tool loop over two turns', () => {
  it('sums the cache-write counts and keeps one raw usage block per turn, in order', async () => {
    const turns = [
      { usage: { inputTokens: 52_000, outputTokens: 300, thinkingTokens: 0, cachedTokens: 0, cacheWrite5mTokens: 45_000, cacheWrite1hTokens: 0 }, rawUsage: [{ turn: 'first' }] },
      { usage: { inputTokens: 53_000, outputTokens: 200, thinkingTokens: 0, cachedTokens: 45_000, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 }, rawUsage: [{ turn: 'second' }] },
    ];
    const res = await runToolLoop(
      async (_transcript, turn) => ({ calls: [{ id: `c${turn}`, name: turn === 1 ? 'tie_file' : 'send_whatsapp_text', args: {} }], text: '', ...turns[turn - 1]! }),
      async (_calls, turn) => ({ results: [{ name: 'x', output: 'done' }], ended: turn === 2 }),
      { maxTurns: 12, correctiveNote: 'note' },
    );
    assert.equal(res.turns, 2);
    assert.equal(res.usage.inputTokens, 105_000);
    assert.equal(res.usage.cacheWrite5mTokens, 45_000);
    assert.equal(res.usage.cachedTokens, 45_000);
    assert.deepEqual(res.rawUsage, [{ turn: 'first' }, { turn: 'second' }]);
  });
});
