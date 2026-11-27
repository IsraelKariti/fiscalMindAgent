import { FunctionCallingConfigMode, type Content, type GenerateContentConfig, type Part } from '@google/genai';
import type Anthropic from '@anthropic-ai/sdk';
import { toAnthropicSchema, type SchemaChanges } from './anthropicSchema.js';
import type { DeclaredTool, LoggedToolCall } from './requestLog.js';
import type { TranscriptCall, TranscriptItem } from './toolLoop.js';

/**
 * Pure translation of a tool-call stage's request and answer for the three
 * providers (openspec `planner-answer-tools`). No env, no DB, no network, so
 * the unit tests pin the exact wire shapes.
 *
 * The contract every provider gets: the tools, the tool choice left to the
 * model (a turn may be text only), parallel calls allowed, and the calls read
 * back in order as `{ id, name, args }`. The loop (toolLoop.ts) keeps a
 * provider-neutral transcript — model turns, tool results, corrective user
 * turns — and each adapter translates it into its own continuation shape.
 */

/** A tool the model may call: name, the one-line description it reads, and flat JSON-schema parameters. */
export interface LlmToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The Gemini-shaped request config of a tool-call stage: function declarations, tool choice left to the model. */
export function toolRequestConfig(tools: LlmToolSpec[]): Pick<GenerateContentConfig, 'tools' | 'toolConfig'> {
  return {
    tools: [
      {
        functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })),
      },
    ],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
    },
  };
}

// ---------------------------------------------------------------------------
// Gemini

/** The prompt contents as a list of turns (a bare string is one user turn). */
export function geminiContentsOf(contents: unknown): Content[] {
  if (typeof contents === 'string') return [{ role: 'user', parts: [{ text: contents }] }];
  if (!Array.isArray(contents)) throw new Error('unsupported Gemini contents shape');
  return contents.map((turn) => (typeof turn === 'string' ? { role: 'user', parts: [{ text: turn }] } : (turn as Content)));
}

/**
 * The transcript as Gemini turns: a model turn replays the provider's own
 * parts when they were kept (they carry the thought signatures the next turn
 * needs), the results are `functionResponse` parts of a user turn, a
 * corrective note a user text turn.
 */
export function geminiTranscriptContents(transcript: readonly TranscriptItem[]): Content[] {
  return transcript.map((item) => {
    if (item.kind === 'model') {
      if (Array.isArray(item.raw) && item.raw.length > 0) return { role: 'model', parts: item.raw as Part[] };
      const parts: Part[] = [];
      if (item.text.trim() !== '') parts.push({ text: item.text });
      for (const c of item.calls) parts.push({ functionCall: { ...(c.id ? { id: c.id } : {}), name: c.name, args: (c.args ?? {}) as Record<string, unknown> } });
      return { role: 'model', parts };
    }
    if (item.kind === 'results') {
      return {
        role: 'user',
        parts: item.results.map((r) => ({ functionResponse: { ...(r.id ? { id: r.id } : {}), name: r.name, response: { result: r.output } } })),
      };
    }
    return { role: 'user', parts: [{ text: item.text }] };
  });
}

/** The calls of a Gemini answer, with their ids when the model gave them. */
export function callsFromGeminiParts(parts: readonly Part[] | undefined): TranscriptCall[] {
  return (parts ?? []).flatMap((p) => (p.functionCall ? [{ ...(p.functionCall.id ? { id: p.functionCall.id } : {}), name: p.functionCall.name ?? '', args: p.functionCall.args ?? {} }] : []));
}

// ---------------------------------------------------------------------------
// Anthropic

/**
 * Anthropic: tools sent WITHOUT `strict: true` (since 2026-11-25) — the
 * provider does not compile the schemas into a grammar, so no call is forced
 * into a shape the schema allows but the stage does not mean (the forced enum
 * value / missing-null class of answers); the stage's own validation gates
 * every call as before. Each parameter schema is flat and fully required, so
 * the keyword stripping of toAnthropicSchema is the only translation.
 * `changes`, when given, records what that stripping changed, paths prefixed
 * by the tool name (openspec `conversation-trace`).
 */
export function toAnthropicTools(tools: DeclaredTool[], changes?: SchemaChanges): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: toAnthropicSchema(t.parameters, changes, t.name) as Anthropic.Tool.InputSchema,
  }));
}

/** The `tool_use` blocks of an Anthropic answer as calls, in order, with their ids. */
export function callsFromAnthropicContent(content: readonly { type: string; id?: string; name?: string; input?: unknown }[]): TranscriptCall[] {
  return content.filter((b) => b.type === 'tool_use').map((b) => ({ ...(b.id ? { id: b.id } : {}), name: b.name ?? '', args: b.input ?? {} }));
}

/**
 * The transcript as Anthropic messages: the assistant turn replays the
 * answer's own content blocks (thinking blocks included) when kept, the
 * results are `tool_result` blocks — one per `tool_use` id, the API requires
 * every id answered — and a corrective note is a user text block; adjacent
 * user items are merged into one message.
 */
export function anthropicTranscriptMessages(transcript: readonly TranscriptItem[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  const pushUser = (blocks: Anthropic.ContentBlockParam[]) => {
    const last = messages[messages.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      (last.content as Anthropic.ContentBlockParam[]).push(...blocks);
      return;
    }
    messages.push({ role: 'user', content: blocks });
  };
  for (const item of transcript) {
    if (item.kind === 'model') {
      if (Array.isArray(item.raw) && item.raw.length > 0) {
        messages.push({ role: 'assistant', content: item.raw as Anthropic.ContentBlockParam[] });
        continue;
      }
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (item.text.trim() !== '') blocks.push({ type: 'text', text: item.text });
      for (const c of item.calls) blocks.push({ type: 'tool_use', id: c.id ?? c.name, name: c.name, input: c.args ?? {} });
      messages.push({ role: 'assistant', content: blocks });
    } else if (item.kind === 'results') {
      pushUser(item.results.map((r) => ({ type: 'tool_result' as const, tool_use_id: r.id ?? r.name, content: r.output })));
    } else {
      pushUser([{ type: 'text', text: item.text }]);
    }
  }
  return messages;
}

// ---------------------------------------------------------------------------
// OpenAI

/**
 * OpenAI Responses: strict function tools — every parameter required and no
 * extra key, so strict mode accepts them as they are. `changes`, when given,
 * records the tools that had no `additionalProperties: false` and got one.
 */
export function toOpenAiTools(tools: DeclaredTool[], changes?: SchemaChanges): Record<string, unknown>[] {
  return tools.map((t) => {
    if (t.parameters.additionalProperties !== false) changes?.additionalPropertiesForced.push(t.name);
    return {
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: { ...t.parameters, additionalProperties: false },
      strict: true,
    };
  });
}

/** The `function_call` output items of a Responses answer as calls, in order (`arguments` is a JSON string). */
export function callsFromOpenAiOutput(output: unknown): TranscriptCall[] {
  if (!Array.isArray(output)) return [];
  return output
    .filter((item): item is { type: string; name?: string; arguments?: unknown; call_id?: string } => typeof item === 'object' && item !== null)
    .filter((item) => item.type === 'function_call')
    .map((item) => {
      let args: unknown = item.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          // Not JSON — hand it through; the stage's gate reports the shape fault.
        }
      }
      return { ...(item.call_id ? { id: item.call_id } : {}), name: item.name ?? '', args: args ?? {} };
    });
}

/**
 * The input items of an OpenAI continuation turn: everything after the last
 * model turn — the results as `function_call_output` (the real result text),
 * a corrective note as a user message. The request itself names the previous
 * response (`previous_response_id`), so the server keeps the prompt, the tools
 * and the model's reasoning items.
 */
export function openAiContinuationInput(transcript: readonly TranscriptItem[]): Record<string, unknown>[] {
  const lastModel = transcript.map((t) => t.kind).lastIndexOf('model');
  const items: Record<string, unknown>[] = [];
  for (const item of transcript.slice(lastModel + 1)) {
    if (item.kind === 'results') for (const r of item.results) items.push({ type: 'function_call_output', call_id: r.id ?? r.name, output: r.output });
    if (item.kind === 'user') items.push({ role: 'user', content: [{ type: 'input_text', text: item.text }] });
  }
  return items;
}

/** The id of the model turn an OpenAI continuation follows; null before the first turn. */
export function openAiPreviousResponseId(transcript: readonly TranscriptItem[]): string | null {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const item = transcript[i]!;
    if (item.kind === 'model') return item.responseId ?? null;
  }
  return null;
}

/** The slice of a Responses API answer the adapter reads. */
export interface OpenAiResponseData {
  id?: string;
  output?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

/** A logged call from a transcript call, for callers that log without the loop. */
export function loggedCallOf(c: TranscriptCall): LoggedToolCall {
  return { name: c.name, args: c.args, ...(c.id !== undefined ? { id: c.id } : {}) };
}
