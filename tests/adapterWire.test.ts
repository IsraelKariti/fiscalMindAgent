import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// openspec `conversation-trace` (adapter-translation-visible): the Anthropic
// and OpenAI adapters put on the wire exactly the schema wireRequest.ts
// computes — the copy the call log stores — and the Anthropic adapter marks
// the fields it filled with null. The providers are replaced by a fetch stub;
// nothing leaves the process.

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

const { generateContentAnthropic } = await import('../src/gemini/anthropic.js');
const { generateContentOpenAI } = await import('../src/gemini/openai.js');
const { sentRequestOf, restoredFieldsOf } = await import('../src/gemini/wireRequest.js');

const schema = {
  type: 'object',
  required: ['suspected_injection', 'evidence'],
  properties: { suspected_injection: { type: 'boolean' }, evidence: { type: ['string', 'null'] } },
  additionalProperties: false,
};
const request = { model: 'm', contents: 'text under review', config: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: schema, httpOptions: { timeout: 60_000 } } };

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

describe('Anthropic adapter', () => {
  it('sends the schema wireRequest computes, no temperature, and marks the fields it filled', async () => {
    captured.length = 0;
    reply = {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'm',
      content: [{ type: 'text', text: '{"suspected_injection":false}' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 3 },
    };
    const response = await generateContentAnthropic(request);
    assert.equal(captured.length, 1);
    const body = captured[0]!.body;
    assert.ok(captured[0]!.url.includes('/v1/messages'));
    const format = (body.output_config as { format: { type: string; schema: unknown } }).format;
    assert.equal(format.type, 'json_schema');
    assert.deepEqual(format.schema, sentRequestOf('anthropic', request)!.responseJsonSchema);
    assert.deepEqual(format.schema, {
      type: 'object',
      required: ['suspected_injection'],
      properties: { suspected_injection: { type: 'boolean' }, evidence: { type: 'string' } },
      additionalProperties: false,
    });
    assert.equal('temperature' in body, false);
    assert.deepEqual(JSON.parse(response.text!), { suspected_injection: false, evidence: null });
    assert.deepEqual(restoredFieldsOf(response), ['evidence']);
  });

  it('the text "null" is handed through and nothing is marked as filled', async () => {
    captured.length = 0;
    reply = {
      id: 'msg_2',
      type: 'message',
      role: 'assistant',
      model: 'm',
      content: [{ type: 'text', text: '{"suspected_injection":false,"evidence":"null"}' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 3 },
    };
    const response = await generateContentAnthropic(request);
    assert.deepEqual(JSON.parse(response.text!), { suspected_injection: false, evidence: 'null' });
    assert.deepEqual(restoredFieldsOf(response), []);
  });
});

describe('OpenAI adapter', () => {
  it('sends the declared schema in strict mode, no temperature, and marks nothing', async () => {
    captured.length = 0;
    reply = {
      id: 'resp_1',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"suspected_injection":false,"evidence":null}' }] }],
      usage: { input_tokens: 5, output_tokens: 3, output_tokens_details: { reasoning_tokens: 0 }, input_tokens_details: { cached_tokens: 0 } },
    };
    const response = await generateContentOpenAI(request);
    assert.equal(captured.length, 1);
    const body = captured[0]!.body;
    const format = (body.text as { format: { type: string; strict: boolean; schema: unknown } }).format;
    assert.equal(format.type, 'json_schema');
    assert.equal(format.strict, true);
    assert.deepEqual(format.schema, sentRequestOf('openai', request)!.responseJsonSchema);
    assert.deepEqual(format.schema, schema);
    assert.equal('temperature' in body, false);
    assert.deepEqual(JSON.parse(response.text!), { suspected_injection: false, evidence: null });
    assert.equal(restoredFieldsOf(response), null);
  });
});
