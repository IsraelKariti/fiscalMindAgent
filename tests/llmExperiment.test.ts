import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LlmExperimentSchema,
  armModelFor,
  armModels,
  parseExperimentValue,
} from '../src/agents/declarationOfCapital/experimentConfig.js';
import { computeCost } from '../src/gemini/cost.js';
import { requestForLog } from '../src/gemini/requestLog.js';

describe('LlmExperimentSchema', () => {
  const arm = (key: string) => ({ key, model: 'gemini-3.7-flash', promptTemplate: null });

  it('accepts a two-arm config with a prompt override', () => {
    const config = {
      enabled: true,
      arms: [arm('A'), { key: 'B', model: 'gpt-5.6-sol', promptTemplate: 'פרומפט מותאם' }],
    };
    assert.deepEqual(LlmExperimentSchema.parse(config), config);
  });

  it('rejects duplicate arm keys', () => {
    assert.equal(LlmExperimentSchema.safeParse({ enabled: true, arms: [arm('A'), arm('A')] }).success, false);
  });

  it('rejects unknown models and malformed keys', () => {
    assert.equal(
      LlmExperimentSchema.safeParse({ enabled: true, arms: [{ ...arm('A'), model: 'gpt-99' }] }).success,
      false,
    );
    assert.equal(LlmExperimentSchema.safeParse({ enabled: true, arms: [arm('not ok!')] }).success, false);
  });

  it('caps the arm count at 4 and requires at least 1', () => {
    assert.equal(LlmExperimentSchema.safeParse({ enabled: false, arms: [] }).success, false);
    assert.equal(
      LlmExperimentSchema.safeParse({ enabled: false, arms: ['A', 'B', 'C', 'D', 'E'].map(arm) }).success,
      false,
    );
  });

  it('rejects an empty prompt override (null means "use the built-in")', () => {
    assert.equal(
      LlmExperimentSchema.safeParse({ enabled: true, arms: [{ ...arm('A'), promptTemplate: '' }] }).success,
      false,
    );
  });
});

describe('per-call-site models', () => {
  const base = { key: 'A', model: 'claude-opus-5', promptTemplate: null };

  it('an arm without pins (older stored shape) runs every call site on its default model', () => {
    const arm = LlmExperimentSchema.parse({ enabled: true, arms: [base] }).arms[0]!;
    assert.equal(armModelFor(arm, 'conversation_decide'), 'claude-opus-5');
    assert.equal(armModelFor(arm, 'verify_document'), 'claude-opus-5');
    assert.deepEqual(armModels(arm), ['claude-opus-5']);
  });

  it('pins override only their own call site', () => {
    const arm = LlmExperimentSchema.parse({
      enabled: true,
      arms: [{ ...base, models: { analyze_file: 'gemini-3.7-flash', verify_document: 'gemini-3.7-flash' } }],
    }).arms[0]!;
    assert.equal(armModelFor(arm, 'conversation_decide'), 'claude-opus-5');
    assert.equal(armModelFor(arm, 'form_intake'), 'claude-opus-5');
    assert.equal(armModelFor(arm, 'analyze_file'), 'gemini-3.7-flash');
    assert.equal(armModelFor(arm, 'verify_document'), 'gemini-3.7-flash');
    assert.deepEqual(armModels(arm).sort(), ['claude-opus-5', 'gemini-3.7-flash']);
  });

  it('rejects unknown call sites and unknown models in pins', () => {
    assert.equal(
      LlmExperimentSchema.safeParse({ enabled: true, arms: [{ ...base, models: { summarize: 'claude-opus-5' } }] }).success,
      false,
    );
    assert.equal(
      LlmExperimentSchema.safeParse({ enabled: true, arms: [{ ...base, models: { form_intake: 'gpt-9' } }] }).success,
      false,
    );
  });
});

describe('parseExperimentValue (fail-closed)', () => {
  it('absent value → no experiment, no error', () => {
    assert.deepEqual(parseExperimentValue(null), { config: null, error: null });
    assert.deepEqual(parseExperimentValue(undefined), { config: null, error: null });
  });

  it('an old/invalid stored shape disables the experiment instead of throwing', () => {
    const { config, error } = parseExperimentValue({ version: 1, variants: ['a', 'b'] });
    assert.equal(config, null);
    assert.notEqual(error, null);
  });
});

describe('computeCost', () => {
  const rates = {
    inputCostPerToken: 1e-6,
    outputCostPerToken: 4e-6,
    thinkingCostPerToken: 2e-6,
    cachedCostPerToken: 0.25e-6,
  };

  it('bills the cached subset at the discounted rate and the remainder at the input rate', () => {
    const cost = computeCost(rates, { inputTokens: 1000, outputTokens: 100, thinkingTokens: 50, cachedTokens: 400 });
    // 600*1 + 400*0.25 + 100*4 + 50*2 (in micro-dollars)
    assert.ok(Math.abs(cost - (600e-6 + 100e-6 + 400e-6 + 100e-6)) < 1e-12);
  });

  it('never bills negative non-cached input when a provider over-reports cached', () => {
    const cost = computeCost(rates, { inputTokens: 100, outputTokens: 0, thinkingTokens: 0, cachedTokens: 150 });
    assert.ok(Math.abs(cost - 150 * rates.cachedCostPerToken) < 1e-12);
  });
});

describe('requestForLog (llm_calls.request redaction)', () => {
  it('replaces binary parts with {mimeType, sizeBytes} — bytes never reach the log', () => {
    const base64 = Buffer.from('fake-pdf-bytes-of-a-client-document').toString('base64');
    const logged = requestForLog({
      model: 'gemini-3.7-flash',
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: 'application/pdf', data: base64 } }, { text: 'חלץ נתונים' }],
        },
      ],
      config: { temperature: 0, responseJsonSchema: { type: 'object' } },
    });
    const serialized = JSON.stringify(logged);
    assert.ok(!serialized.includes(base64));
    const parts = (logged.contents as { parts: Record<string, unknown>[] }[])[0]!.parts;
    // sizeBytes is an estimate from the base64 length (±padding), close enough for the log.
    assert.deepEqual(parts[0], {
      inlineData: { mimeType: 'application/pdf', sizeBytes: Math.round((base64.length * 3) / 4) },
    });
    assert.deepEqual(parts[1], { text: 'חלץ נתונים' });
  });

  it('keeps string contents and the system instruction verbatim, and copies the schema', () => {
    const logged = requestForLog({
      model: 'gpt-5.6-sol',
      contents: 'the exact input',
      config: { systemInstruction: 'the system prompt', responseMimeType: 'application/json' },
    });
    assert.equal(logged.contents, 'the exact input');
    assert.equal(logged.systemInstruction, 'the system prompt');
    assert.deepEqual(logged.config, { responseMimeType: 'application/json' });
  });

  it('truncates pathologically long text but keeps the length marker', () => {
    const logged = requestForLog({ model: 'm', contents: 'x'.repeat(250_000) });
    const contents = logged.contents as string;
    assert.ok(contents.length < 250_000);
    assert.ok(contents.includes('[truncated 50000 chars]'));
  });
});
