import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// openspec `llm-provider-outage`: which failed call opens a hold on its
// provider (a reason on our side: billing, key, quota, rate limit outliving
// the retries, server error, unreachable, the spend cap) and which never does
// (a timeout, a plain bad request, an answer the model did give), plus the
// hold-state transitions and the routing of a call under a hold.
// generate.ts reads env at import, so the required variables are stubbed first.

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

const { ApiError } = await import('@google/genai');
const Anthropic = (await import('@anthropic-ai/sdk')).default;
const { OpenAiApiError } = await import('../src/gemini/openai.js');
const { LlmBudgetExceededError } = await import('../src/gemini/budget.js');
const { outageKindOf, openHoldIn, clearHoldIn, noteProbeFailureIn, parseHoldState, routeUnderHold, holdOldEnoughToAcknowledge, holdsAfterFailures } =
  await import('../src/gemini/outageRules.js');

const now = new Date('2026-11-22T12:49:49Z');
const anthropicBilling = new Anthropic.APIError(
  400,
  { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } },
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
  undefined,
);

describe('outageKindOf', () => {
  it('reads the Anthropic credit error as billing', () => {
    assert.equal(outageKindOf(anthropicBilling), 'billing');
  });

  it('reads an OpenAI insufficient_quota 429 as billing and a plain 429 as a rate limit', () => {
    assert.equal(outageKindOf(new OpenAiApiError(429, 'You exceeded your current quota (insufficient_quota)')), 'billing');
    assert.equal(outageKindOf(new OpenAiApiError(429, 'Rate limit reached for gpt-5.5')), 'rate_limit');
  });

  it('reads a Gemini bad key 400 as auth and a quota 429 as quota', () => {
    assert.equal(outageKindOf(new ApiError({ message: 'API key not valid. Please pass a valid API key.', status: 400 })), 'auth');
    assert.equal(outageKindOf(new ApiError({ message: 'RESOURCE_EXHAUSTED: You exceeded your current quota', status: 429 })), 'billing');
    assert.equal(outageKindOf(new ApiError({ message: 'Quota exceeded for requests per minute', status: 429 })), 'quota');
  });

  it('reads 401 as auth, 5xx as server, transport failures as unreachable, the spend cap as budget', () => {
    assert.equal(outageKindOf(new OpenAiApiError(401, 'Incorrect API key provided')), 'auth');
    assert.equal(outageKindOf(new ApiError({ message: 'overloaded', status: 503 })), 'server');
    assert.equal(outageKindOf(new Anthropic.APIError(529, undefined, 'overloaded', undefined)), 'server');
    assert.equal(outageKindOf(new TypeError('fetch failed')), 'unreachable');
    assert.equal(outageKindOf(new Anthropic.APIConnectionError({ message: 'socket hang up' })), 'unreachable');
    assert.equal(outageKindOf(new LlmBudgetExceededError('platform', 12, 10)), 'budget');
  });

  it('opens no hold for a timeout, a plain 400, a refusal or an ordinary error', () => {
    assert.equal(outageKindOf(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), null);
    assert.equal(outageKindOf(new ApiError({ message: 'Invalid JSON payload received. Unknown name "foo"', status: 400 })), null);
    assert.equal(outageKindOf(new OpenAiApiError(400, 'Invalid schema for function')), null);
    assert.equal(outageKindOf(new Error('planner: model returned no text')), null);
    assert.equal(outageKindOf('boom'), null);
  });
});

describe('hold state transitions', () => {
  it('opens once, keeps the start time and refreshes the error on a later failure', () => {
    const first = openHoldIn({}, 'anthropic', { kind: 'billing', message: 'credit', model: 'claude-sonnet-5' }, now);
    assert.equal(first.opened, true);
    assert.equal(first.state.anthropic?.since, now.toISOString());
    const later = new Date(now.getTime() + 60_000);
    const second = openHoldIn(first.state, 'anthropic', { kind: 'auth', message: 'key', model: 'claude-opus-5' }, later);
    assert.equal(second.opened, false);
    assert.equal(second.state.anthropic?.since, now.toISOString());
    assert.equal(second.state.anthropic?.kind, 'auth');
    assert.equal(second.state.anthropic?.message, 'key');
    assert.equal(second.state.anthropic?.model, 'claude-sonnet-5');
  });

  it('clears only the named provider and reports whether there was one', () => {
    const both = openHoldIn(openHoldIn({}, 'anthropic', { kind: 'billing', message: 'a', model: null }, now).state, 'gemini', { kind: 'server', message: 'b', model: null }, now).state;
    const cleared = clearHoldIn(both, 'anthropic');
    assert.equal(cleared.cleared, true);
    assert.equal(cleared.state.anthropic, undefined);
    assert.ok(cleared.state.gemini);
    assert.equal(clearHoldIn(cleared.state, 'anthropic').cleared, false);
  });

  it('a failed probe stamps the time and the error without touching the start', () => {
    const state = openHoldIn({}, 'anthropic', { kind: 'billing', message: 'a', model: null }, now).state;
    const probed = noteProbeFailureIn(state, 'anthropic', 'still too low', new Date(now.getTime() + 300_000));
    assert.equal(probed.anthropic?.since, now.toISOString());
    assert.equal(probed.anthropic?.lastError, 'still too low');
    assert.equal(probed.anthropic?.lastProbeAt, new Date(now.getTime() + 300_000).toISOString());
  });

  it('round-trips through JSON and tolerates a broken value', () => {
    const state = openHoldIn({}, 'budget', { kind: 'budget', message: 'cap', model: null }, now).state;
    assert.deepEqual(parseHoldState(JSON.stringify(state)), state);
    assert.deepEqual(parseHoldState(null), {});
    assert.deepEqual(parseHoldState('not json'), {});
    assert.deepEqual(parseHoldState('{"anthropic":{"kind":"billing"}}'), {});
  });
});

describe('routeUnderHold', () => {
  const anthropicHeld = openHoldIn({}, 'anthropic', { kind: 'billing', message: 'a', model: null }, now).state;

  it('sends to the primary when nothing is held', () => {
    assert.deepEqual(routeUnderHold({}, 'anthropic', 'gemini'), { route: 'primary' });
  });

  it('goes straight to a backup on a free provider when the primary is held', () => {
    assert.deepEqual(routeUnderHold(anthropicHeld, 'anthropic', 'gemini'), { route: 'backup' });
  });

  it('refuses when the primary is held and there is no free backup', () => {
    assert.deepEqual(routeUnderHold(anthropicHeld, 'anthropic', null), { route: 'held', provider: 'anthropic', kind: 'billing' });
    const bothHeld = openHoldIn(anthropicHeld, 'gemini', { kind: 'server', message: 'b', model: null }, now).state;
    assert.equal(routeUnderHold(bothHeld, 'anthropic', 'gemini').route, 'held');
  });

  it('the budget hold refuses every call', () => {
    const budget = openHoldIn({}, 'budget', { kind: 'budget', message: 'cap', model: null }, now).state;
    assert.deepEqual(routeUnderHold(budget, 'gemini', 'openai'), { route: 'held', provider: 'budget', kind: 'budget' });
  });
});

describe('holdOldEnoughToAcknowledge', () => {
  const hold = openHoldIn({}, 'anthropic', { kind: 'billing', message: 'a', model: null }, now).state.anthropic!;

  it('is false inside the delay, true after it, never when disabled', () => {
    assert.equal(holdOldEnoughToAcknowledge(hold, new Date(now.getTime() + 240_000), 600), false);
    assert.equal(holdOldEnoughToAcknowledge(hold, new Date(now.getTime() + 600_000), 600), true);
    assert.equal(holdOldEnoughToAcknowledge(hold, new Date(now.getTime() + 6_000_000), 0), false);
  });
});

describe('holdsAfterFailures', () => {
  it('opens nothing for a timeout-only failure', () => {
    const timeout = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    assert.deepEqual(holdsAfterFailures([{ model: 'gemini-3.7-flash', err: timeout }]), []);
  });

  it('opens one hold on the provider of the billing 400', () => {
    const holds = holdsAfterFailures([{ model: 'claude-sonnet-5', err: anthropicBilling }]);
    assert.equal(holds.length, 1);
    assert.equal(holds[0]?.provider, 'anthropic');
    assert.equal(holds[0]?.kind, 'billing');
    assert.equal(holds[0]?.model, 'claude-sonnet-5');
  });

  it('opens one hold per failed provider when primary and backup both failed', () => {
    const holds = holdsAfterFailures([
      { model: 'gemini-3.7-flash', err: new ApiError({ message: 'overloaded', status: 503 }) },
      { model: 'claude-sonnet-5', err: new OpenAiApiError(401, 'unauthorized') },
    ]);
    assert.deepEqual(
      holds.map((h) => [h.provider, h.kind]),
      [
        ['gemini', 'server'],
        ['anthropic', 'auth'],
      ],
    );
  });

  it('names the budget pseudo-provider for the spend cap', () => {
    const holds = holdsAfterFailures([{ model: 'gemini-3.7-flash', err: new LlmBudgetExceededError('platform', 12, 10) }]);
    assert.deepEqual(
      holds.map((h) => [h.provider, h.kind, h.model]),
      [['budget', 'budget', null]],
    );
  });
});
