import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FunctionCallingConfigMode } from '@google/genai';
import {
  callsFromAnthropicContent,
  callsFromOpenAiOutput,
  toAnthropicTools,
  toOpenAiTools,
  toolRequestConfig,
} from '../src/gemini/toolTransport.js';
import { declaredToolsOf, requestForLog, responseForLog, toolCallsOf } from '../src/gemini/requestLog.js';
import { toolJsonSchemas } from '../src/agents/declarationOfCapital/decisionTools.js';

// openspec `planner-answer-tools`: the same flat tools go to every provider with
// a forced tool answer, and the calls come back as { name, args } in order.

const CAPITAL = {
  windowOpen: true,
  templates: [],
  intake: { resolvable: [], typedRows: [], inboundTexts: new Map(), allSettled: false, attestationRequested: false, confirmableMessageIds: new Set<string>(), attestationConfirmed: false },
};
const tools = toolJsonSchemas(CAPITAL);

describe('Gemini request config', () => {
  it('declares every tool with its JSON schema and forces a call to one of them', () => {
    const config = toolRequestConfig(tools);
    const declarations = (config.tools![0] as { functionDeclarations: { name: string; parametersJsonSchema: unknown }[] }).functionDeclarations;
    assert.deepEqual(declarations.map((d) => d.name), tools.map((t) => t.name));
    assert.equal(declarations[0]!.parametersJsonSchema, tools[0]!.parameters);
    assert.equal(config.toolConfig!.functionCallingConfig!.mode, FunctionCallingConfigMode.ANY);
    assert.deepEqual(config.toolConfig!.functionCallingConfig!.allowedFunctionNames, tools.map((t) => t.name));
  });

  it('declaredToolsOf reads the declarations back from a Gemini-shaped request', () => {
    const declared = declaredToolsOf(toolRequestConfig(tools));
    assert.deepEqual(declared, tools);
    assert.deepEqual(declaredToolsOf({ responseJsonSchema: {} } as never), []);
    assert.deepEqual(declaredToolsOf(undefined), []);
  });
});

describe('Anthropic translation', () => {
  it('sends strict tools whose schemas carry no unsupported keyword and no extra keys', () => {
    const out = toAnthropicTools(declaredToolsOf(toolRequestConfig(tools)));
    assert.equal(out.length, tools.length);
    for (const tool of out) {
      assert.equal(tool.strict, true, tool.name);
      assert.equal(tool.input_schema.type, 'object', tool.name);
      assert.equal((tool.input_schema as { additionalProperties?: unknown }).additionalProperties, false, tool.name);
      assert.ok(!('$schema' in tool.input_schema), tool.name);
      const required = new Set(((tool.input_schema as { required?: string[] }).required ?? []));
      for (const name of Object.keys((tool.input_schema as { properties?: object }).properties ?? {})) assert.ok(required.has(name), `${tool.name}.${name}`);
    }
  });

  it('reads tool_use blocks as calls, in order, ignoring text blocks', () => {
    const calls = callsFromAnthropicContent([
      { type: 'text', text: 'thinking aloud' } as never,
      { type: 'tool_use', name: 'conclude', input: { decision: 'follow_up', reasoning: 'r' } },
      { type: 'tool_use', name: 'send_whatsapp_text', input: { text: 'שלום', send_at: 'asap' } },
    ]);
    assert.deepEqual(calls, [
      { name: 'conclude', args: { decision: 'follow_up', reasoning: 'r' } },
      { name: 'send_whatsapp_text', args: { text: 'שלום', send_at: 'asap' } },
    ]);
  });
});

describe('OpenAI translation', () => {
  it('sends strict function tools with additionalProperties:false', () => {
    const out = toOpenAiTools(declaredToolsOf(toolRequestConfig(tools)));
    for (const tool of out) {
      assert.equal(tool.type, 'function');
      assert.equal(tool.strict, true);
      assert.equal((tool.parameters as { additionalProperties?: unknown }).additionalProperties, false);
    }
    assert.deepEqual(out.map((t) => t.name), tools.map((t) => t.name));
  });

  it('reads function_call items, parsing the arguments string, and ignores message items', () => {
    const calls = callsFromOpenAiOutput([
      { type: 'reasoning', summary: [] },
      { type: 'function_call', name: 'conclude', arguments: '{"decision":"collect","reasoning":"file"}', call_id: 'c1' },
      { type: 'function_call', name: 'tie_file', arguments: '{"file_id":"f","document_id":"d","evidence_message_id":"","evidence_quote":""}', call_id: 'c2' },
      { type: 'message', content: [{ type: 'output_text', text: 'ignored' }] },
    ]);
    assert.deepEqual(calls.map((c) => c.name), ['conclude', 'tie_file']);
    assert.deepEqual(calls[0]!.args, { decision: 'collect', reasoning: 'file' });
    assert.deepEqual(callsFromOpenAiOutput('nope'), []);
    // Unparseable arguments are handed through for the gate to report.
    assert.deepEqual(callsFromOpenAiOutput([{ type: 'function_call', name: 'x', arguments: '{bad' }]), [{ name: 'x', args: '{bad' }]);
  });
});

describe('logging', () => {
  it('requestForLog keeps the tools and the forced-choice config', () => {
    const logged = requestForLog({ model: 'm', contents: 'hi', config: { temperature: 0.3, ...toolRequestConfig(tools) } });
    const config = logged.config as Record<string, unknown>;
    assert.ok(Array.isArray(config.tools));
    assert.ok(config.toolConfig);
    assert.equal(config.responseJsonSchema, undefined);
  });

  it('toolCallsOf reads a plain functionCalls property or the parts of the first candidate; responseForLog stores the calls as JSON', () => {
    const plain = { functionCalls: [{ name: 'conclude', args: { decision: 'follow_up', reasoning: 'r' } }] };
    assert.deepEqual(toolCallsOf(plain), [{ name: 'conclude', args: { decision: 'follow_up', reasoning: 'r' } }]);
    const viaParts = { candidates: [{ content: { parts: [{ text: 'x' }, { functionCall: { name: 'send_whatsapp_text', args: { text: 'a', send_at: 'asap' } } }] } }] };
    assert.deepEqual(toolCallsOf(viaParts), [{ name: 'send_whatsapp_text', args: { text: 'a', send_at: 'asap' } }]);
    assert.deepEqual(toolCallsOf({ text: 'just text' }), []);
    assert.equal(responseForLog(plain), JSON.stringify(plain.functionCalls));
    assert.equal(responseForLog({ text: '{"a":1}' }), '{"a":1}');
    assert.equal(responseForLog({}), null);
  });
});
