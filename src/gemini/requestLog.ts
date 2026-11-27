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
 * The loop rule of a tool-call answer (openspec `planner-answer-tools`): the
 * run ends on an accepted call of one of `terminalTools`, after a second turn
 * without calls, or after `maxTurns` model turns; the calls of all turns, each
 * with the result it was answered with, form one answer. Rows written before
 * 2026-11-27 carry the former rule (`untilTool`); the web reads both.
 */
export interface ToolContinuation {
  terminalTools: string[];
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

/**
 * The exact model input, reduced to a loggable JSON shape. `sent`, when the
 * provider adapter changed the request before sending (wireRequest.ts), is
 * stored next to the declared config so the call modal can show the schema
 * or tools as the provider received them (openspec `conversation-trace`).
 */
export function requestForLog(request: LoggableRequest, sent?: Record<string, unknown> | null): Record<string, unknown> {
  const cfg = request.config ?? {};
  return {
    model: request.model,
    ...(typeof cfg.systemInstruction === 'string' ? { systemInstruction: textForLog(cfg.systemInstruction) } : {}),
    contents: contentsForLog(request.contents),
    ...(request.continuation ? { continuation: request.continuation } : {}),
    ...(sent ? { sent } : {}),
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
  /** The provider's call id, when it gives one (Anthropic `tool_use.id`, OpenAI `call_id`, Gemini `functionCall.id`). */
  id?: string;
  /** The model turn that made the call (1-based); absent on rows of single-turn answers written before the loop. */
  turn?: number;
  /** The result text the call was answered with (the loop); absent before the call ran and on older rows. */
  result?: string;
}

/** Structural view of a response's function calls — the SDK class exposes `functionCalls`; the translation layers set it as a plain property. */
interface ResponseWithCalls {
  functionCalls?: { id?: string; name?: string; args?: unknown; turn?: number; result?: string }[];
  candidates?: { content?: { parts?: { functionCall?: { id?: string; name?: string; args?: unknown } }[] } }[];
  text?: string;
  /** The text the model wrote per turn of a tool loop (never sent to the client). */
  texts?: { turn: number; text: string }[];
}

/** The tool calls of a response, in order; [] when the model answered with text only. */
export function toolCallsOf(response: ResponseWithCalls): LoggedToolCall[] {
  const calls =
    response.functionCalls ??
    response.candidates?.[0]?.content?.parts?.flatMap((p) => (p.functionCall ? [p.functionCall] : [])) ??
    [];
  return calls.map((c) => ({
    name: c.name ?? '',
    args: c.args ?? {},
    ...('id' in c && typeof c.id === 'string' ? { id: c.id } : {}),
    ...('turn' in c && typeof c.turn === 'number' ? { turn: c.turn } : {}),
    ...('result' in c && typeof c.result === 'string' ? { result: c.result } : {}),
  }));
}

/**
 * The response as stored in llm_calls.response: a tool-call answer as the JSON
 * list of its items — every call with its turn and result, and the text the
 * model wrote in a turn as `{ turn, text }`, ordered by turn with the text
 * first — a form answer as its text. Reads the calls first so the SDK's `text`
 * getter is not touched on a response without text parts.
 */
export function responseForLog(response: ResponseWithCalls): string | null {
  const calls = toolCallsOf(response);
  const texts = response.texts ?? [];
  if (calls.length > 0 || texts.length > 0) {
    const items: Record<string, unknown>[] = [
      ...texts.map((t) => ({ turn: t.turn, text: t.text })),
      ...calls.map((c) => ({ ...c })),
    ];
    const turnOf = (x: Record<string, unknown>) => (typeof x.turn === 'number' ? x.turn : 0);
    items.sort((a, b) => turnOf(a) - turnOf(b) || (('text' in a ? 0 : 1) - ('text' in b ? 0 : 1)));
    return JSON.stringify(items);
  }
  return response.text ?? null;
}
