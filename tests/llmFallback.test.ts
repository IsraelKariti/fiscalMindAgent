import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// openspec `llm-model-settings`: which errors move a call from the primary to
// the backup model (a provider failure of any kind) and which never do (the
// budget stop, an ordinary error), plus the reason the fallback step names.
// generate.ts reads env at import, so the test stubs the required variables
// first, like adapterWire.test.ts; nothing is sent anywhere.

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
const { failureReasonOf, isProviderFailure } = await import('../src/gemini/generate.js');

const timeout = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
const network = new TypeError('fetch failed');

describe('isProviderFailure', () => {
  it('accepts API errors of every status, timeouts and transport failures', () => {
    assert.equal(isProviderFailure(new ApiError({ message: 'overloaded', status: 503 })), true);
    assert.equal(isProviderFailure(new ApiError({ message: 'bad request', status: 400 })), true);
    assert.equal(isProviderFailure(new OpenAiApiError(401, 'unauthorized')), true);
    assert.equal(isProviderFailure(new Anthropic.APIError(529, undefined, 'overloaded', undefined)), true);
    assert.equal(isProviderFailure(new Anthropic.APIConnectionError({ message: 'socket hang up' })), true);
    assert.equal(isProviderFailure(timeout), true);
    assert.equal(isProviderFailure(network), true);
  });

  it('refuses the budget stop and ordinary errors', () => {
    assert.equal(isProviderFailure(new LlmBudgetExceededError('platform', 12, 10)), false);
    assert.equal(isProviderFailure(new Error('planner: model returned no text')), false);
    assert.equal(isProviderFailure('boom'), false);
  });
});

describe('failureReasonOf', () => {
  it('names the status, the timeout or the network, with the message', () => {
    assert.deepEqual(failureReasonOf(new ApiError({ message: 'overloaded', status: 503 })), { kind: 503, message: 'overloaded' });
    assert.deepEqual(failureReasonOf(new OpenAiApiError(401, 'unauthorized')).kind, 401);
    assert.equal(failureReasonOf(timeout).kind, 'timeout');
    assert.equal(failureReasonOf(network).kind, 'network');
    assert.equal(failureReasonOf(new Anthropic.APIConnectionError({ message: 'socket hang up' })).kind, 'network');
    assert.deepEqual(failureReasonOf(new Error('x')), { kind: 'error', message: 'x' });
  });
});

const { failureReasonLabel, fallbackLogOf } = await import('../src/gemini/wireRequest.js');

// openspec `fallbacks-dashboard`: the backup call's log context carries the
// fallback mark the row records; the primary's context is left alone.
describe('fallbackLogOf', () => {
  const from = { model: 'claude-opus-5', provider: 'anthropic' };
  const log: { userId: null; agentInstanceId: null; clientId: string; purpose: string; fallbackFrom?: { model: string; provider: string; reason: string } | null } = {
    userId: null,
    agentInstanceId: null,
    clientId: 'c1',
    purpose: 'planner',
  };

  it('marks the backup call with the primary and the reason, without touching the primary context', () => {
    const backup = fallbackLogOf(log, from, { kind: 400, message: 'grammar too large' });
    assert.deepEqual(backup, { ...log, fallbackFrom: { model: 'claude-opus-5', provider: 'anthropic', reason: 'status 400' } });
    assert.equal('fallbackFrom' in log, false);
  });

  it('names a held provider as "provider held"', () => {
    assert.equal(fallbackLogOf(log, from, { kind: 'held', message: 'billing: credit' })?.fallbackFrom?.reason, 'provider held');
    assert.equal(failureReasonLabel({ kind: 'timeout', message: '' }), 'timeout');
    assert.equal(failureReasonLabel({ kind: 'network', message: '' }), 'network');
    assert.equal(failureReasonLabel({ kind: 503, message: '' }), 'status 503');
  });

  it('has nothing to mark on an unlogged call', () => {
    assert.equal(fallbackLogOf(undefined, from, { kind: 'timeout', message: '' }), undefined);
  });
});
