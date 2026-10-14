import type { Content, Part } from '@google/genai';

/**
 * Reduction of an LLM request to the loggable JSON stored in
 * llm_calls.request (049). Pure (no env/DB imports) so tests can pin the
 * redaction guarantee: binary parts must NEVER land in the log as bytes.
 */

const MAX_LOGGED_TEXT = 200_000;

function textForLog(text: string): string {
  if (text.length <= MAX_LOGGED_TEXT) return text;
  return `${text.slice(0, MAX_LOGGED_TEXT)}… [truncated ${text.length - MAX_LOGGED_TEXT} chars]`;
}

/** Binary parts are logged as {mimeType, sizeBytes} placeholders, never as bytes. */
function partForLog(part: Part): Record<string, unknown> {
  if (part.text !== undefined) return { text: textForLog(part.text) };
  const inline = part.inlineData;
  if (inline) {
    return {
      inlineData: {
        mimeType: inline.mimeType,
        sizeBytes: Math.round(((inline.data?.length ?? 0) * 3) / 4),
      },
    };
  }
  return { unsupported: Object.keys(part) };
}

function contentsForLog(contents: unknown): unknown {
  if (typeof contents === 'string') return textForLog(contents);
  if (!Array.isArray(contents)) return contents;
  return contents.map((turn) => {
    if (typeof turn === 'string') return textForLog(turn);
    const content = turn as Content;
    if (!Array.isArray(content.parts)) return content;
    return { role: content.role, parts: content.parts.map(partForLog) };
  });
}

/**
 * Continuation of a tool-call answer (openspec `planner-answer-tools`): when a
 * turn's calls include no `untilTool`, the provider adapter answers every call
 * with the literal result "recorded" and asks for the next calls, up to
 * `maxTurns` turns in all; the calls of all turns form one answer. Needed for
 * OpenAI's reasoning models, which make one action call per turn; Gemini and
 * Anthropic make all calls in one turn and ignore it.
 */
export interface ToolContinuation {
  untilTool: string;
  maxTurns: number;
}

/** Structural view of the request — every Gemini-shaped request satisfies it. */
export interface LoggableRequest {
  model: string;
  contents?: unknown;
  continuation?: ToolContinuation;
  config?: {
    systemInstruction?: unknown;
    temperature?: unknown;
    responseMimeType?: unknown;
    responseJsonSchema?: unknown;
    /** The tools offered to a tool-call stage (openspec `planner-answer-tools`) and the forced-choice config. */
    tools?: unknown;
    toolConfig?: unknown;
  };
}

/** The exact model input, reduced to a loggable JSON shape. */
export function requestForLog(request: LoggableRequest): Record<string, unknown> {
  const cfg = request.config ?? {};
  return {
    model: request.model,
    ...(typeof cfg.systemInstruction === 'string' ? { systemInstruction: textForLog(cfg.systemInstruction) } : {}),
    contents: contentsForLog(request.contents),
    ...(request.continuation ? { continuation: request.continuation } : {}),
    config: {
      ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
      ...(cfg.responseMimeType !== undefined ? { responseMimeType: cfg.responseMimeType } : {}),
      ...(cfg.responseJsonSchema !== undefined ? { responseJsonSchema: cfg.responseJsonSchema } : {}),
      ...(cfg.tools !== undefined ? { tools: cfg.tools } : {}),
      ...(cfg.toolConfig !== undefined ? { toolConfig: cfg.toolConfig } : {}),
    },
  };
}

/** A tool as runLlmCall declares it under `config.tools[].functionDeclarations` (JSON-schema parameters). */
export interface DeclaredTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The tools a Gemini-shaped request offers, flattened; [] for a form-answer request. */
export function declaredToolsOf(config: { tools?: unknown } | undefined): DeclaredTool[] {
  const tools = Array.isArray(config?.tools) ? (config!.tools as { functionDeclarations?: unknown }[]) : [];
  return tools.flatMap((t) =>
    (Array.isArray(t.functionDeclarations) ? (t.functionDeclarations as Record<string, unknown>[]) : []).map((d) => ({
      name: String(d.name ?? ''),
      description: String(d.description ?? ''),
      parameters: (d.parametersJsonSchema as Record<string, unknown> | undefined) ?? (d.parameters as Record<string, unknown> | undefined) ?? { type: 'object', properties: {} },
    })),
  );
}

/** One tool call as logged and as handed to the stage's gate: the tool name and its raw arguments. */
export interface LoggedToolCall {
  name: string;
  args: unknown;
  /** The model turn that made the call (1-based), set only by a continued answer (`ToolContinuation`); absent = the single turn. */
  turn?: number;
}

/** Structural view of a response's function calls — the SDK class exposes `functionCalls`; the translation layers set it as a plain property. */
interface ResponseWithCalls {
  functionCalls?: { name?: string; args?: unknown; turn?: number }[];
  candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[];
  text?: string;
}

/** The tool calls of a response, in order; [] when the model answered with text only. */
export function toolCallsOf(response: ResponseWithCalls): LoggedToolCall[] {
  const calls =
    response.functionCalls ??
    response.candidates?.[0]?.content?.parts?.flatMap((p) => (p.functionCall ? [p.functionCall] : [])) ??
    [];
  return calls.map((c) => ({ name: c.name ?? '', args: c.args ?? {}, ...('turn' in c && typeof c.turn === 'number' ? { turn: c.turn } : {}) }));
}

/**
 * The response as stored in llm_calls.response: a tool-call answer as the JSON
 * list of its calls, a form answer as its text. Reads the calls first so the
 * SDK's `text` getter is not touched on a response without text parts.
 */
export function responseForLog(response: ResponseWithCalls): string | null {
  const calls = toolCallsOf(response);
  if (calls.length > 0) return JSON.stringify(calls);
  return response.text ?? null;
}
