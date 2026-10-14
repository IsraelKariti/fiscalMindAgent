import { FunctionCallingConfigMode, type GenerateContentConfig } from '@google/genai';
import type Anthropic from '@anthropic-ai/sdk';
import { toAnthropicSchema } from './anthropicSchema.js';
import type { DeclaredTool, LoggedToolCall } from './requestLog.js';

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
