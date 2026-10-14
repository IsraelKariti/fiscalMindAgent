import type { genaiClient } from './client.js';
import { getGeminiModel } from './modelSettings.js';
import { providerForModel, type LlmCallPurpose } from './modelCatalog.js';
import {
  generateWithRetryDetailed,
  usageFromResponse,
  type GeminiUsage,
  type LlmCallLogContext,
} from './generate.js';
import { toolCallsOf, type LoggedToolCall } from './requestLog.js';
import { toolRequestConfig, type LlmToolSpec } from './toolTransport.js';

type GeminiRequest = Parameters<typeof genaiClient.models.generateContent>[0];

export type { LlmToolSpec };

/**
 * The exact request of one LLM stage, minus the model — what a `build*Call`
 * factory returns. Every DoC stage has one (buildFormIntakeCall,
 * buildInjectionScreenCall, buildAnalysisCall, buildExtractionCall,
 * buildDecisionCall) so the app and the evals harness send byte-identical
 * prompts: the runtime does `runLlmCall(build…(), { log })`, the harness does
 * `runLlmCall(build…(), { model, log: { sink } })` and judges the answer with
 * the stage's own code gate.
 *
 * A stage answers EITHER with one JSON object (`responseJsonSchema`) OR with
 * tool calls (`tools`, openspec `planner-answer-tools`: the model must call
 * one or more of the tools in a single turn; no tool result goes back).
 * Exactly one of the two is set.
 *
 * Builders take plain data (rows, bytes, sanitized text) and import nothing
 * from db/, so they can run without a database.
 */
export interface LlmCallSpec {
  purpose: LlmCallPurpose;
  /** Trusted instructions (rules, catalog, expected-document context). */
  systemInstruction?: string;
  /** The user turn(s): untrusted client data only, fenced/sanitized by the builder. */
  contents: GeminiRequest['contents'];
  /** JSON schema the answer must satisfy (zod-to-json-schema output, $schema removed). */
  responseJsonSchema?: Record<string, unknown>;
  /** The tools the model must answer with (forced tool choice, parallel calls allowed). */
  tools?: LlmToolSpec[];
  temperature: number;
}

export interface RunLlmCallOptions {
  /** Per-call llm_calls attribution (or a file sink for the evals harness). */
  log?: Omit<LlmCallLogContext, 'purpose'> & { purpose?: string };
  /** Overrides the admin-selected model for this one call. The app never sets it; the harness does. */
  model?: string;
}

/** One tool call the model made: the tool's name and its raw arguments. */
export type LlmToolCall = LoggedToolCall;

export interface LlmCallResult {
  /** The answer text of a form-answer stage; '' for a tool-call stage. */
  text: string;
  /** The calls of a tool-call stage, in the order the model made them; [] for a form-answer stage. */
  toolCalls: LlmToolCall[];
  usage: GeminiUsage;
  /** The model that actually served the call, for per-model usage accounting. */
  model: string;
  provider: string;
  /** Provider round trips this answer took (retries on 429/5xx/timeouts). */
  attempts: number;
}

/** The Gemini-shaped request config of a spec: a response schema, or tools with a forced tool answer. */
export function requestConfigOf(spec: LlmCallSpec): NonNullable<GeminiRequest['config']> {
  const base = {
    ...(spec.systemInstruction !== undefined ? { systemInstruction: spec.systemInstruction } : {}),
    temperature: spec.temperature,
  };
  if (spec.tools) {
    if (spec.responseJsonSchema) throw new Error(`${spec.purpose}: a call spec sets either tools or responseJsonSchema, not both`);
    return { ...base, ...toolRequestConfig(spec.tools) };
  }
  if (!spec.responseJsonSchema) throw new Error(`${spec.purpose}: a call spec needs tools or a responseJsonSchema`);
  return { ...base, responseMimeType: 'application/json', responseJsonSchema: spec.responseJsonSchema };
}

/**
 * Resolves the model (per-purpose admin setting unless overridden), sends the
 * spec through the shared retry loop and returns the raw answer: the text of a
 * form-answer stage (throws on an empty answer — a refusal — since every such
 * stage needs JSON back), or the tool calls of a tool-call stage (an empty
 * list is returned as is: the stage's gate rejects it and asks again).
 */
export async function runLlmCall(spec: LlmCallSpec, opts: RunLlmCallOptions = {}): Promise<LlmCallResult> {
  const model = opts.model ?? (await getGeminiModel(spec.purpose));
  const request: GeminiRequest = { model, contents: spec.contents, config: requestConfigOf(spec) };
  const log: LlmCallLogContext | undefined = opts.log ? { ...opts.log, purpose: opts.log.purpose ?? spec.purpose } : undefined;
  const { response, attempts } = await generateWithRetryDetailed(request, log);
  const usage = usageFromResponse(response);
  const provider = providerForModel(model);
  if (spec.tools) {
    return { text: '', toolCalls: toolCallsOf(response), usage, model, provider, attempts };
  }
  const text = response.text;
  if (!text) {
    throw new Error(`${spec.purpose}: model returned no text (refusal or empty response): ${JSON.stringify(response)}`);
  }
  return { text, toolCalls: [], usage, model, provider, attempts };
}
