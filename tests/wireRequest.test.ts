import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeLlmStagesStatic } from '../src/gemini/llmStages.js';
import { emptySchemaChanges, restoreOmittedNulls, toAnthropicSchema } from '../src/gemini/anthropicSchema.js';
import { toAnthropicTools, toOpenAiTools } from '../src/gemini/toolTransport.js';
import { requestForLog, type DeclaredTool } from '../src/gemini/requestLog.js';
import { restoredFieldsOf, sentRequestOf, traceStepsOf, translationOf, translationStepDetail } from '../src/gemini/wireRequest.js';

// openspec `conversation-trace` (adapter-translation-visible): the translators
// report what they changed, the sent copy is computed from the same
// translators the adapters use, and the two trace steps follow a fixed
// decision table per provider.

type Stage = ReturnType<typeof describeLlmStagesStatic>[number] & { schema?: Record<string, unknown>; tools?: DeclaredTool[] };
const stages = describeLlmStagesStatic() as Stage[];
const stage = (purpose: string): Stage => {
  const s = stages.find((x) => x.purpose === purpose);
  assert.ok(s, `stage ${purpose}`);
  return s;
};
const injection = stage('injection_detection_llm').schema!;
const classification = stage('file_classification').schema!;
const extraction = stage('extract_document').schema!;
const plannerTools = stage('generate_message').tools!;

const schemaRequest = (schema: Record<string, unknown>, temperature = 0) => ({
  model: 'm',
  contents: 'hi',
  config: { temperature, responseMimeType: 'application/json', responseJsonSchema: schema },
});
const toolRequest = (tools: DeclaredTool[]) => ({
  model: 'm',
  contents: 'hi',
  config: {
    temperature: 0.3,
    tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
  },
});

describe('toAnthropicSchema reports its changes by path', () => {
  it('injection screen: evidence loses null and leaves required; output identical with or without the collector', () => {
    const changes = emptySchemaChanges();
    const withCollector = toAnthropicSchema(injection, changes);
    assert.deepEqual(withCollector, toAnthropicSchema(injection));
    assert.deepEqual(changes.nullRemoved, ['evidence']);
    assert.deepEqual(changes.requiredDropped, ['evidence']);
    assert.deepEqual(changes.keywordsStripped, []);
    assert.deepEqual(changes.additionalPropertiesForced, []);
  });

  it('file classification: nested holdings paths and the document_paper enum', () => {
    const changes = emptySchemaChanges();
    toAnthropicSchema(classification, changes);
    for (const path of ['tax_year', 'matched_document_id', 'holdings[].account_number', 'holdings[].holder_name', 'employer_name', 'document_paper']) {
      assert.ok(changes.nullRemoved.includes(path), `null removed: ${path}`);
      assert.ok(changes.requiredDropped.includes(path), `required dropped: ${path}`);
    }
  });

  it('extraction: parties[].id_number and the dates', () => {
    const changes = emptySchemaChanges();
    toAnthropicSchema(extraction, changes);
    for (const path of ['issuer', 'as_of_date', 'valid_until', 'parties[].id_number']) {
      assert.ok(changes.nullRemoved.includes(path), `null removed: ${path}`);
    }
  });

  it('stripped keywords and forced additionalProperties carry their node', () => {
    const changes = emptySchemaChanges();
    const schema = {
      type: 'object',
      properties: { amount: { type: 'number', minimum: 0 }, rows: { type: 'array', maxItems: 5, items: { type: 'object', properties: { n: { type: 'string', pattern: 'x' } } } } },
      required: ['amount', 'rows'],
    };
    toAnthropicSchema(schema, changes);
    assert.deepEqual(changes.keywordsStripped, [
      { path: 'amount', keyword: 'minimum' },
      { path: 'rows', keyword: 'maxItems' },
      { path: 'rows[].n', keyword: 'pattern' },
    ]);
    assert.deepEqual(changes.additionalPropertiesForced, ['rows[]', '(root)']);
    assert.deepEqual(changes.nullRemoved, []);
  });

  it('tool parameter paths are prefixed by the tool name', () => {
    const changes = emptySchemaChanges();
    const tool: DeclaredTool = { name: 'my_tool', description: 'x', parameters: { type: 'object', properties: { a: { type: ['string', 'null'] }, b: { type: 'integer', minimum: 1 } }, required: ['a', 'b'] } };
    toAnthropicTools([tool], changes);
    assert.deepEqual(changes.nullRemoved, ['my_tool.a']);
    assert.deepEqual(changes.requiredDropped, ['my_tool.a']);
    assert.deepEqual(changes.keywordsStripped, [{ path: 'my_tool.b', keyword: 'minimum' }]);
    assert.deepEqual(changes.additionalPropertiesForced, ['my_tool']);
  });

  it('the real planner tools need no change on either provider', () => {
    const anthropic = emptySchemaChanges();
    toAnthropicTools(plannerTools, anthropic);
    assert.deepEqual(anthropic, emptySchemaChanges());
    const openai = emptySchemaChanges();
    toOpenAiTools(plannerTools, openai);
    assert.deepEqual(openai.additionalPropertiesForced, []);
    const loose: DeclaredTool = { name: 'loose', description: 'x', parameters: { type: 'object', properties: {}, required: [] } };
    toOpenAiTools([loose], openai);
    assert.deepEqual(openai.additionalPropertiesForced, ['loose']);
  });
});

describe('restoreOmittedNulls reports the fields it filled', () => {
  it('a field the model left out is filled and reported', () => {
    const filled: string[] = [];
    const out = restoreOmittedNulls(injection, { suspected_injection: false }, filled) as Record<string, unknown>;
    assert.equal(out.evidence, null);
    assert.deepEqual(filled, ['evidence']);
  });

  it('the text "null" is neither filled nor reported (the 2026-10-14 production row)', () => {
    const filled: string[] = [];
    const out = restoreOmittedNulls(injection, { suspected_injection: false, evidence: 'null' }, filled) as Record<string, unknown>;
    assert.equal(out.evidence, 'null');
    assert.deepEqual(filled, []);
  });

  it('an explicit null is not reported; nested paths are', () => {
    const filled: string[] = [];
    restoreOmittedNulls(injection, { suspected_injection: false, evidence: null }, filled);
    assert.deepEqual(filled, []);
    const nested: string[] = [];
    restoreOmittedNulls(extraction, { is_expected_type: true, parties: [{ role: 'owner', name: 'x' }, { role: 'other', name: 'y', id_number: null }] }, nested);
    assert.ok(nested.includes('parties[].id_number'));
    assert.ok(nested.includes('as_of_date'));
    assert.equal(nested.filter((p) => p === 'parties[].id_number').length, 1);
  });
});

describe('the sent copy per provider', () => {
  it('Gemini sends the request as declared: no sent copy, no translation', () => {
    assert.equal(translationOf('gemini', schemaRequest(injection)), null);
    assert.equal(sentRequestOf('gemini', toolRequest(plannerTools)), null);
  });

  it('Anthropic, schema stage: the collapsed schema, strict, temperature left out', () => {
    const t = translationOf('anthropic', schemaRequest(injection))!;
    assert.deepEqual(t.sent.responseJsonSchema, toAnthropicSchema(injection));
    assert.equal(t.sent.provider, 'anthropic');
    assert.equal(t.sent.strict, true);
    assert.deepEqual(t.sent.omitted, ['temperature']);
    assert.equal(t.sent.tools, undefined);
    assert.equal(t.schemaChanged, true);
    assert.equal(t.toolsStrict, false);
  });

  it('Anthropic, a schema with nothing to collapse: sent unchanged, schemaChanged false', () => {
    const split = stage('file_splitting').schema!;
    const t = translationOf('anthropic', schemaRequest(split))!;
    assert.deepEqual(t.sent.responseJsonSchema, split);
    assert.equal(t.schemaChanged, false);
  });

  it('OpenAI, schema stage: the declared schema as is, strict', () => {
    const t = translationOf('openai', schemaRequest(injection))!;
    assert.deepEqual(t.sent.responseJsonSchema, injection);
    assert.equal(t.sent.strict, true);
    assert.equal(t.schemaChanged, false);
    assert.deepEqual(t.sent.omitted, ['temperature']);
  });

  it('tool stages: every tool strict with additionalProperties:false, in one shape for both providers', () => {
    for (const provider of ['anthropic', 'openai'] as const) {
      const t = translationOf(provider, toolRequest(plannerTools))!;
      assert.equal(t.toolsStrict, true);
      assert.equal(t.sent.responseJsonSchema, undefined);
      assert.equal(t.sent.tools!.length, plannerTools.length);
      for (const tool of t.sent.tools!) {
        assert.equal(tool.strict, true);
        assert.equal((tool.parameters as Record<string, unknown>).additionalProperties, false);
        assert.ok(plannerTools.some((d) => d.name === tool.name));
      }
    }
  });

  it('no temperature declared: nothing is reported as left out', () => {
    const request = { model: 'm', contents: 'hi', config: { responseJsonSchema: injection } };
    assert.deepEqual(translationOf('anthropic', request)!.sent.omitted, []);
  });
});

describe('requestForLog carries the sent copy next to the declared config', () => {
  const request = {
    model: 'm',
    contents: [{ role: 'user', parts: [{ text: 'hi' }, { inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }] }],
    config: { temperature: 0, responseJsonSchema: injection },
  };
  it('with a sent copy', () => {
    const sent = sentRequestOf('anthropic', request)!;
    const logged = requestForLog(request, sent as unknown as Record<string, unknown>);
    assert.deepEqual(logged.sent, sent);
    assert.deepEqual((logged.config as Record<string, unknown>).responseJsonSchema, injection);
    const parts = (logged.contents as { parts: Record<string, unknown>[] }[])[0]!.parts;
    assert.deepEqual(parts[1], { inlineData: { mimeType: 'application/pdf', sizeBytes: 3 } });
  });
  it('without one (Gemini, old callers): no key at all', () => {
    assert.equal('sent' in requestForLog(request), false);
    assert.equal('sent' in requestForLog(request, null), false);
  });
});

describe('the trace steps per provider', () => {
  const db = { clientId: 'c1', sink: 'db' as const };
  const anthropicAnswer = { text: '{"suspected_injection":false,"evidence":null}', restoredFields: ['evidence'] };
  const plainAnswer = { text: '{"suspected_injection":false,"evidence":null}' };

  it('Anthropic schema stage: translate, then restore with the filled paths', () => {
    const steps = traceStepsOf('anthropic', schemaRequest(injection), db, 'injection_detection_llm', anthropicAnswer);
    assert.deepEqual(steps.map((s) => s.action), ['translate_request', 'restore_answer']);
    assert.deepEqual(steps[0]!.detail, {
      provider: 'anthropic',
      purpose: 'injection_detection_llm',
      model: 'm',
      schema_changed: true,
      null_removed: ['evidence'],
      required_dropped: ['evidence'],
      keywords_stripped: [],
      additional_properties_forced: [],
      omitted: ['temperature'],
      tools_strict: false,
    });
    assert.deepEqual(steps[1]!.detail, { provider: 'anthropic', purpose: 'injection_detection_llm', model: 'm', filled: ['evidence'] });
  });

  it('Anthropic answer with nothing filled still records the restore step, saying so', () => {
    const steps = traceStepsOf('anthropic', schemaRequest(injection), db, 'injection_detection_llm', { text: '{}', restoredFields: [] });
    assert.deepEqual(steps[1]!.detail.filled, []);
  });

  it('Anthropic tool stage: translate only (the adapter changes nothing in the calls)', () => {
    const steps = traceStepsOf('anthropic', toolRequest(plannerTools), db, 'generate_message', { functionCalls: [{ name: 'conclude', args: {} }] });
    assert.deepEqual(steps.map((s) => s.action), ['translate_request']);
    assert.equal(steps[0]!.detail.tools_strict, true);
    assert.equal(steps[0]!.detail.schema_changed, false);
  });

  it('OpenAI: translate only, with temperature left out and the tools strict', () => {
    assert.deepEqual(traceStepsOf('openai', schemaRequest(injection), db, 'injection_detection_llm', plainAnswer).map((s) => s.action), ['translate_request']);
    const tools = traceStepsOf('openai', toolRequest(plannerTools), db, 'generate_message', plainAnswer);
    assert.equal(tools.length, 1);
    assert.equal(tools[0]!.detail.tools_strict, true);
    assert.deepEqual(tools[0]!.detail.omitted, ['temperature']);
  });

  it('Gemini: none', () => {
    assert.deepEqual(traceStepsOf('gemini', schemaRequest(injection), db, 'injection_detection_llm', plainAnswer), []);
  });

  it('no client, or the evals file sink: none', () => {
    assert.deepEqual(traceStepsOf('anthropic', schemaRequest(injection), { clientId: null, sink: 'db' }, 'x', anthropicAnswer), []);
    assert.deepEqual(traceStepsOf('anthropic', schemaRequest(injection), { clientId: 'c1', sink: { file: 'out.jsonl' } }, 'x', anthropicAnswer), []);
    assert.deepEqual(traceStepsOf('anthropic', schemaRequest(injection), undefined, 'x', anthropicAnswer), []);
  });

  it('restoredFieldsOf reads the adapter mark and nothing else', () => {
    assert.deepEqual(restoredFieldsOf(anthropicAnswer), ['evidence']);
    assert.equal(restoredFieldsOf(plainAnswer), null);
    assert.equal(restoredFieldsOf(null), null);
    const detail = translationStepDetail(translationOf('openai', schemaRequest(injection))!, 'p', 'm');
    assert.equal(detail.schema_changed, false);
  });
});
