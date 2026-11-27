import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FunctionCallingConfigMode } from '@google/genai';
import {
  anthropicTranscriptMessages,
  callsFromAnthropicContent,
  callsFromGeminiParts,
  callsFromOpenAiOutput,
  geminiContentsOf,
  geminiTranscriptContents,
  openAiContinuationInput,
  openAiPreviousResponseId,
  toAnthropicTools,
  toOpenAiTools,
  toolRequestConfig,
} from '../src/gemini/toolTransport.js';
import type { TranscriptItem } from '../src/gemini/toolLoop.js';
import { declaredToolsOf, requestForLog, responseForLog, toolCallsOf } from '../src/gemini/requestLog.js';
import { toolJsonSchemas } from '../src/agents/declarationOfCapital/decisionTools.js';

// openspec `planner-answer-tools`: the same flat tools go to every provider with
// the tool choice left to the model, the calls come back as { id, name, args }
// in order, and the loop's transcript — model turns, tool results, corrective
// notes — is replayed in each provider's own shape.

const CAPITAL = {
  windowOpen: true,
  templates: [],
  intake: { resolvable: [], typedRows: [], inboundTexts: new Map(), allSettled: false, attestationRequested: false, confirmableMessageIds: new Set<string>(), attestationConfirmed: false },
};
const tools = toolJsonSchemas(CAPITAL);

const transcript: TranscriptItem[] = [
  { kind: 'model', turn: 1, calls: [{ id: 'c1', name: 'tie_file', args: { file_id: 'f', document_id: 'd' } }], text: '', responseId: 'resp_1' },
  { kind: 'results', turn: 1, results: [{ id: 'c1', name: 'tie_file', output: 'tied · verification: APPROVED' }] },
  { kind: 'model', turn: 2, calls: [], text: 'ok then' },
  { kind: 'user', turn: 2, text: 'NOTE: end the run' },
];

describe('Gemini request config', () => {
  it('declares every tool with its JSON schema and leaves the tool choice to the model', () => {
    const config = toolRequestConfig(tools);
    const declarations = (config.tools![0] as { functionDeclarations: { name?: string; parametersJsonSchema?: unknown }[] }).functionDeclarations;
    assert.deepEqual(declarations.map((d) => d.name), tools.map((t) => t.name));
    assert.deepEqual(declarations[0]!.parametersJsonSchema, tools[0]!.parameters);
    assert.equal(config.toolConfig!.functionCallingConfig!.mode, FunctionCallingConfigMode.AUTO);
    assert.equal(config.toolConfig!.functionCallingConfig!.allowedFunctionNames, undefined);
  });

  it('declaredToolsOf reads the declarations back from a Gemini-shaped request', () => {
    const declared = declaredToolsOf(toolRequestConfig(tools));
    assert.deepEqual(declared.map((t) => t.name), tools.map((t) => t.name));
    assert.deepEqual(declared[0]!.parameters, tools[0]!.parameters);
  });

  it('replays the transcript as model / user turns: functionCall parts, functionResponse parts with the result, a text note', () => {
    assert.deepEqual(geminiContentsOf('hi'), [{ role: 'user', parts: [{ text: 'hi' }] }]);
    const contents = geminiTranscriptContents(transcript);
    assert.deepEqual(contents, [
      { role: 'model', parts: [{ functionCall: { id: 'c1', name: 'tie_file', args: { file_id: 'f', document_id: 'd' } } }] },
      { role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'tie_file', response: { result: 'tied · verification: APPROVED' } } }] },
      { role: 'model', parts: [{ text: 'ok then' }] },
      { role: 'user', parts: [{ text: 'NOTE: end the run' }] },
    ]);
    // The provider's own parts (thought signatures) win when kept.
    const raw = [{ functionCall: { name: 'tie_file', args: {} }, thoughtSignature: 'sig' }];
    assert.deepEqual(geminiTranscriptContents([{ kind: 'model', turn: 1, calls: [{ name: 'tie_file', args: {} }], text: '', raw }]), [{ role: 'model', parts: raw }]);
    assert.deepEqual(callsFromGeminiParts([{ text: 'x' }, { functionCall: { id: 'g1', name: 'send_whatsapp_text', args: { text: 'a' } } }]), [{ id: 'g1', name: 'send_whatsapp_text', args: { text: 'a' } }]);
  });
});

describe('Anthropic translation', () => {
  it('sends non-strict tools whose schemas carry no unsupported keyword and no extra keys', () => {
    const sent = toAnthropicTools(tools);
    assert.deepEqual(sent.map((t) => t.name), tools.map((t) => t.name));
    for (const tool of sent) {
      assert.equal('strict' in tool, false);
      const schema = tool.input_schema as Record<string, unknown>;
      assert.equal(schema.type, 'object');
      assert.equal(schema.additionalProperties, false);
      assert.ok(!('$schema' in schema));
    }
  });

  it('reads tool_use blocks as calls with their ids, in order, ignoring text blocks', () => {
    const calls = callsFromAnthropicContent([
      { type: 'text' },
      { type: 'tool_use', id: 'toolu_1', name: 'set_required', input: { document_id: 'd' } },
      { type: 'tool_use', id: 'toolu_2', name: 'send_whatsapp_text', input: { text: 'a', send_at: 'asap' } },
    ]);
    assert.deepEqual(calls, [
      { id: 'toolu_1', name: 'set_required', args: { document_id: 'd' } },
      { id: 'toolu_2', name: 'send_whatsapp_text', args: { text: 'a', send_at: 'asap' } },
    ]);
  });

  it('replays the transcript as assistant tool_use blocks and user tool_result blocks, merging adjacent user items', () => {
    const messages = anthropicTranscriptMessages(transcript);
    assert.deepEqual(messages, [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'tie_file', input: { file_id: 'f', document_id: 'd' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'tied · verification: APPROVED' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'ok then' }] },
      { role: 'user', content: [{ type: 'text', text: 'NOTE: end the run' }] },
    ]);
    // Results then a corrective note in a row become one user message; the answer's own blocks (thinking) are replayed when kept.
    const raw = [{ type: 'thinking', thinking: 'hm', signature: 's' }, { type: 'tool_use', id: 'c1', name: 'tie_file', input: {} }];
    const merged = anthropicTranscriptMessages([
      { kind: 'model', turn: 1, calls: [{ id: 'c1', name: 'tie_file', args: {} }], text: '', raw },
      { kind: 'results', turn: 1, results: [{ id: 'c1', name: 'tie_file', output: 'tied' }] },
      { kind: 'user', turn: 1, text: 'note' },
    ]);
    assert.deepEqual(merged, [
      { role: 'assistant', content: raw },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'tied' }, { type: 'text', text: 'note' }] },
    ]);
  });
});

describe('OpenAI translation', () => {
  it('sends strict function tools with additionalProperties:false', () => {
    const sent = toOpenAiTools(tools);
    for (const tool of sent) {
      assert.equal(tool.type, 'function');
      assert.equal(tool.strict, true);
      assert.equal((tool.parameters as Record<string, unknown>).additionalProperties, false);
    }
    assert.deepEqual(sent.map((t) => t.name), tools.map((t) => t.name));
  });

  it('reads function_call items with their call ids, parsing the arguments string, and ignores message items', () => {
    const calls = callsFromOpenAiOutput([
      { type: 'reasoning', summary: [] },
      { type: 'function_call', call_id: 'call_1', name: 'tie_file', arguments: '{"file_id":"f","document_id":"d"}' },
      { type: 'message', content: [{ type: 'output_text', text: 'ignored' }] },
      { type: 'function_call', call_id: 'call_2', name: 'send_whatsapp_text', arguments: 'not json' },
    ]);
    assert.deepEqual(calls, [
      { id: 'call_1', name: 'tie_file', args: { file_id: 'f', document_id: 'd' } },
      { id: 'call_2', name: 'send_whatsapp_text', args: 'not json' },
    ]);
  });

  it('continues the previous response with the results and the note as input items', () => {
    assert.equal(openAiPreviousResponseId([]), null);
    assert.equal(openAiPreviousResponseId(transcript), null, 'the last model turn had no id');
    assert.equal(openAiPreviousResponseId(transcript.slice(0, 2)), 'resp_1');
    assert.deepEqual(openAiContinuationInput(transcript.slice(0, 2)), [{ type: 'function_call_output', call_id: 'c1', output: 'tied · verification: APPROVED' }]);
    assert.deepEqual(openAiContinuationInput(transcript), [{ role: 'user', content: [{ type: 'input_text', text: 'NOTE: end the run' }] }]);
  });
});

describe('logging', () => {
  it('requestForLog keeps the tools, the tool config and the loop rule', () => {
    const logged = requestForLog({ model: 'm', contents: 'hi', config: { temperature: 0.3, ...toolRequestConfig(tools) } });
    const config = logged.config as Record<string, unknown>;
    assert.ok(Array.isArray(config.tools));
    assert.ok(config.toolConfig);
    assert.equal(config.responseJsonSchema, undefined);
    assert.equal(logged.continuation, undefined);
    const rule = { terminalTools: ['send_whatsapp_text', 'send_whatsapp_template', 'goal_complete', 'client_declined'], maxTurns: 12 };
    const looped = requestForLog({ model: 'm', contents: 'hi', continuation: rule, config: toolRequestConfig(tools) });
    assert.deepEqual(looped.continuation, rule);
  });

  it('toolCallsOf reads a plain functionCalls property or the parts of the first candidate; responseForLog stores the items as JSON, texts first per turn', () => {
    const plain = { functionCalls: [{ id: 'c1', name: 'tie_file', args: { file_id: 'f' }, turn: 1, result: 'tied' }, { name: 'send_whatsapp_text', args: { text: 'a' }, turn: 2 }] };
    assert.deepEqual(toolCallsOf(plain), [{ name: 'tie_file', args: { file_id: 'f' }, id: 'c1', turn: 1, result: 'tied' }, { name: 'send_whatsapp_text', args: { text: 'a' }, turn: 2 }]);
    const viaParts = { candidates: [{ content: { parts: [{ text: 'x' }, { functionCall: { name: 'send_whatsapp_text', args: { text: 'a', send_at: 'asap' } } }] } }] };
    assert.deepEqual(toolCallsOf(viaParts), [{ name: 'send_whatsapp_text', args: { text: 'a', send_at: 'asap' } }]);
    assert.deepEqual(toolCallsOf({ text: 'just text' }), []);
    const stored = JSON.parse(responseForLog({ ...plain, texts: [{ turn: 2, text: 'I will send now' }] })!) as Record<string, unknown>[];
    assert.deepEqual(stored.map((i) => [i.turn, i.name ?? i.text]), [[1, 'tie_file'], [2, 'I will send now'], [2, 'send_whatsapp_text']]);
    assert.equal(stored[0]!.result, 'tied');
    assert.equal(responseForLog({ text: '{"a":1}' }), '{"a":1}');
    assert.equal(responseForLog({}), null);
  });
});
