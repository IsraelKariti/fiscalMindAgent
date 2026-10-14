import { FunctionCallingConfigMode, type GenerateContentConfig } from '@google/genai';
import type Anthropic from '@anthropic-ai/sdk';
import { toAnthropicSchema } from './anthropicSchema.js';
import type { DeclaredTool, LoggedToolCall, ToolContinuation } from './requestLog.js';

/**
 * Pure translation of a tool-call stage's request and answer for the three
 * providers (openspec `planner-answer-tools`). No env, no DB, no network, so
 * the unit tests pin the exact wire shapes.
 *
 * The contract every provider gets: the tools, a FORCED tool answer (the
 * model may not answer in text), parallel calls allowed, and the calls read
 * back in order as `{ name, args }`.
 */

/** A tool the model may call: name, the one-line description it reads, and flat JSON-schema parameters. */
export interface LlmToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The Gemini-shaped request config of a tool-call stage: function declarations + mode ANY restricted to them. */
export function toolRequestConfig(tools: LlmToolSpec[]): Pick<GenerateContentConfig, 'tools' | 'toolConfig'> {
  return {
    tools: [
      {
        functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })),
      },
    ],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: tools.map((t) => t.name) },
    },
  };
}

/**
 * Anthropic: strict tools (`strict: true` makes the compiler guarantee each
 * call matches its schema). Each parameter schema is flat and fully required,
 * so the keyword stripping of toAnthropicSchema is the only translation.
 */
export function toAnthropicTools(tools: DeclaredTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: toAnthropicSchema(t.parameters) as Anthropic.Tool.InputSchema,
    strict: true,
  }));
}

/** The `tool_use` blocks of an Anthropic answer as calls, in order. */
export function callsFromAnthropicContent(content: readonly { type: string; name?: string; input?: unknown }[]): LoggedToolCall[] {
  return content.filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name ?? '', args: b.input ?? {} }));
}

/** OpenAI Responses: strict function tools — every parameter required and no extra key, so strict mode accepts them as they are. */
export function toOpenAiTools(tools: DeclaredTool[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: { ...t.parameters, additionalProperties: false },
    strict: true,
  }));
}

/** The `function_call` output items of a Responses answer as calls, in order (`arguments` is a JSON string). */
export function callsFromOpenAiOutput(output: unknown): LoggedToolCall[] {
  if (!Array.isArray(output)) return [];
  return output
    .filter((item): item is { type: string; name?: string; arguments?: unknown } => typeof item === 'object' && item !== null)
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
      return { name: item.name ?? '', args: args ?? {} };
    });
}

/** The slice of a Responses API answer the continuation loop reads. */
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

/** The usage of one or more Responses turns, summed. */
export interface OpenAiUsageSum {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

function addUsage(sum: OpenAiUsageSum, data: OpenAiResponseData): void {
  sum.inputTokens += data.usage?.input_tokens ?? 0;
  sum.outputTokens += data.usage?.output_tokens ?? 0;
  sum.cachedTokens += data.usage?.input_tokens_details?.cached_tokens ?? 0;
  sum.reasoningTokens += data.usage?.output_tokens_details?.reasoning_tokens ?? 0;
}

/** The literal tool result every call gets in a continuation: the call was recorded, nothing else comes back. */
export const CONTINUATION_RESULT = 'recorded';

/**
 * The continuation items of one turn: every `function_call` answered with
 * "recorded", keyed by its call_id, in order. Nothing else is re-sent — the
 * next request names the previous response (`previous_response_id`), so the
 * server keeps the prompt, the tools and the model's reasoning items.
 */
export function continuationInput(output: unknown): { type: 'function_call_output'; call_id: string; output: string }[] {
  if (!Array.isArray(output)) return [];
  return output
    .filter((item): item is { type: string; call_id?: string } => typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'function_call')
    .map((item) => ({ type: 'function_call_output' as const, call_id: String(item.call_id ?? ''), output: CONTINUATION_RESULT }));
}

/**
 * Runs one Responses request and, with a continuation, keeps asking until a
 * turn calls `untilTool`, a turn makes no call, or `maxTurns` turns were made.
 * OpenAI's reasoning models (gpt-5, gpt-5.4, gpt-6-*) make ONE action call per
 * turn whatever the request says (measured 2026-10-14); feeding each call back
 * as recorded is the only way they reach `conclude`. `send` is injected so the
 * unit tests drive the loop without the network. Returns the calls of all turns
 * in order and the summed usage.
 */
export async function runOpenAiToolTurns(
  first: Record<string, unknown>,
  continuation: ToolContinuation | undefined,
  send: (body: Record<string, unknown>) => Promise<OpenAiResponseData>,
): Promise<{ output: unknown[]; calls: LoggedToolCall[]; usage: OpenAiUsageSum; turns: number }> {
  const usage: OpenAiUsageSum = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0 };
  const output: unknown[] = [];
  const calls: LoggedToolCall[] = [];
  let body = first;
  let turns = 0;
  for (;;) {
    const data = await send(body);
    turns++;
    addUsage(usage, data);
    if (Array.isArray(data.output)) output.push(...data.output);
    const turnCalls = callsFromOpenAiOutput(data.output);
    calls.push(...turnCalls);
    const done =
      !continuation ||
      turnCalls.length === 0 ||
      turnCalls.some((c) => c.name === continuation.untilTool) ||
      turns >= continuation.maxTurns ||
      !data.id;
    if (done) return { output, calls, usage, turns };
    body = {
      model: first.model,
      previous_response_id: data.id,
      input: continuationInput(data.output),
      tools: first.tools,
      tool_choice: first.tool_choice,
      parallel_tool_calls: first.parallel_tool_calls,
      ...(first.reasoning ? { reasoning: first.reasoning } : {}),
    };
  }
}
