import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FunctionCallingConfigMode } from '@google/genai';
import {
  CONTINUATION_RESULT,
  callsFromAnthropicContent,
  callsFromOpenAiOutput,
  runOpenAiToolTurns,
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

// OpenAI's reasoning models make one action call per turn (measured 2026-10-14),
// so the adapter answers every call "recorded" and asks again until `conclude`.
describe('OpenAI continuation until the final tool', () => {
  const call = (name: string, id: string) => ({ type: 'function_call', name, arguments: '{}', call_id: id });
  const turn = (id: string, items: unknown[], input = 100, cached = 0) => ({
    id,
    output: items,
    usage: { input_tokens: input, output_tokens: 10, input_tokens_details: { cached_tokens: cached }, output_tokens_details: { reasoning_tokens: 3 } },
  });
  const first = { model: 'gpt-6-astra', input: [{ role: 'user' }], tools: [{ name: 't' }], tool_choice: 'required', parallel_tool_calls: true };
  const until = { untilTool: 'conclude', maxTurns: 6 };

  it('stops after one turn when conclude is among the calls', async () => {
    const sent: Record<string, unknown>[] = [];
    const res = await runOpenAiToolTurns(first, until, async (b) => (sent.push(b), turn('r1', [call('send_whatsapp_text', 'a'), call('conclude', 'b')])));
    assert.equal(res.turns, 1);
    assert.deepEqual(res.calls.map((c) => c.name), ['send_whatsapp_text', 'conclude']);
    assert.equal(sent.length, 1);
  });

  it('feeds each call back as "recorded" against the previous response until conclude, summing the usage', async () => {
    const sent: Record<string, unknown>[] = [];
    const answers = [
      turn('r1', [{ type: 'reasoning', summary: [] }, call('resolve_document', 'c1')], 1000, 900),
      turn('r2', [call('send_whatsapp_text', 'c2')], 1100, 1000),
      turn('r3', [call('conclude', 'c3')], 1200, 1100),
    ];
    const res = await runOpenAiToolTurns(first, until, async (b) => (sent.push(b), answers[sent.length - 1]!));
    assert.equal(res.turns, 3);
    assert.deepEqual(res.calls.map((c) => c.name), ['resolve_document', 'send_whatsapp_text', 'conclude']);
    // Every call carries the turn that made it, and the stored response keeps it for the trace.
    assert.deepEqual(res.calls.map((c) => c.turn), [1, 2, 3]);
    assert.deepEqual(toolCallsOf({ functionCalls: res.calls }).map((c) => c.turn), [1, 2, 3]);
    assert.ok(JSON.parse(responseForLog({ functionCalls: res.calls })!)[2].turn === 3);
    assert.deepEqual(res.usage, { inputTokens: 3300, outputTokens: 30, cachedTokens: 3000, reasoningTokens: 9 });
    // The second request names the first response and carries only the tool results.
    assert.equal(sent[1]!.previous_response_id, 'r1');
    assert.deepEqual(sent[1]!.input, [{ type: 'function_call_output', call_id: 'c1', output: CONTINUATION_RESULT }]);
    assert.equal(sent[1]!.tool_choice, 'required');
    assert.deepEqual(sent[1]!.tools, first.tools);
    assert.equal(sent[2]!.previous_response_id, 'r2');
    assert.ok(!('instructions' in sent[1]!));
  });

  it('gives up at maxTurns and on a turn without calls; the gate then reports the missing conclude', async () => {
    let n = 0;
    const capped = await runOpenAiToolTurns(first, { untilTool: 'conclude', maxTurns: 3 }, async () => turn(`r${++n}`, [call('add_instance', `c${n}`)]));
    assert.equal(capped.turns, 3);
    assert.deepEqual(capped.calls.map((c) => c.name), ['add_instance', 'add_instance', 'add_instance']);
    n = 0;
    const silent = await runOpenAiToolTurns(first, until, async () => turn(`r${++n}`, n === 1 ? [call('add_instance', 'c1')] : [{ type: 'message', content: [] }]));
    assert.equal(silent.turns, 2);
    assert.deepEqual(silent.calls.map((c) => c.name), ['add_instance']);
  });

  it('without a continuation rule a single turn is all there is', async () => {
    let n = 0;
    const res = await runOpenAiToolTurns(first, undefined, async () => turn(`r${++n}`, [call('add_instance', 'c1')]));
    assert.equal(res.turns, 1);
    assert.equal(n, 1);
    assert.equal(res.calls[0]!.turn, undefined);
  });
});

describe('logging', () => {
  it('requestForLog keeps the tools and the forced-choice config', () => {
    const logged = requestForLog({ model: 'm', contents: 'hi', config: { temperature: 0.3, ...toolRequestConfig(tools) } });
    const config = logged.config as Record<string, unknown>;
    assert.ok(Array.isArray(config.tools));
    assert.ok(config.toolConfig);
    assert.equal(config.responseJsonSchema, undefined);
    assert.equal(logged.continuation, undefined);
    const continued = requestForLog({ model: 'm', contents: 'hi', continuation: { untilTool: 'conclude', maxTurns: 6 }, config: toolRequestConfig(tools) });
    assert.deepEqual(continued.continuation, { untilTool: 'conclude', maxTurns: 6 });
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
