import type { genaiClient } from './client.js';
import { getGeminiModel, resolveBackupModel } from './modelSettings.js';
import { providerForModel, type LlmCallPurpose } from './modelCatalog.js';
import {
  failureReasonOf,
  generateWithRetryDetailed,
  isProviderFailure,
  usageFromResponse,
  type GeminiUsage,
  type LlmCallLogContext,
  type LlmRequest,
} from './generate.js';
import { toolCallsOf, type LoggedToolCall } from './requestLog.js';
import { toolRequestConfig, type LlmToolSpec } from './toolTransport.js';
import { fallbackStepOf, traceStepsEnabled } from './wireRequest.js';
import { recordAudit } from '../audit/audit.js';
import { logger } from '../util/logger.js';

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
 * one or more of the tools; Gemini and Anthropic make them in a single turn,
 * OpenAI's reasoning models one per turn, so `finalTool` names the call that
 * closes the answer and the OpenAI adapter keeps asking — every call answered
 * "recorded" — until it arrives, at most MAX_TOOL_TURNS turns). Exactly one of
 * the two is set.
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
  /** The tool whose call closes a tool answer; a turn without it is continued (see above). Only with `tools`. */
  finalTool?: string;
  temperature: number;
}

/** Turns one tool answer may take in all, first turn included; reached without `finalTool`, the calls go to the gate as they are. */
export const MAX_TOOL_TURNS = 6;

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
  const primary = opts.model ?? (await getGeminiModel(spec.purpose));
  if (spec.finalTool && !spec.tools) throw new Error(`${spec.purpose}: finalTool needs tools`);
  const request: LlmRequest = {
    model: primary,
    contents: spec.contents,
    config: requestConfigOf(spec),
    ...(spec.finalTool ? { continuation: { untilTool: spec.finalTool, maxTurns: MAX_TOOL_TURNS } } : {}),
  };
  const log: LlmCallLogContext | undefined = opts.log ? { ...opts.log, purpose: opts.log.purpose ?? spec.purpose } : undefined;
  // A pinned model (the evals harness) is the only one tried.
  const backup = opts.model ? null : await resolveBackupModel(spec.purpose, primary);
  const { response, attempts, model } = await runWithBackup(spec.purpose, request, backup, log);
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

/** The primary gets one attempt and one retry when a backup stands behind it. */
const PRIMARY_ATTEMPTS_WITH_BACKUP = 2;

/**
 * Sends the request on its model and, when the stage has a backup model and
 * the primary did not answer (openspec `llm-model-settings`), sends the same
 * request once more on the backup with the full retry loop. The primary's
 * failed call keeps its own error row; the switch is a `fallback_model` step
 * of the client's trace (never for the evals harness); the backup's call row
 * and result name the backup model. Only a provider failure switches: the
 * budget stop and any other error propagate as they are.
 */
async function runWithBackup(
  purpose: LlmCallPurpose,
  request: LlmRequest,
  backup: string | null,
  log: LlmCallLogContext | undefined,
): Promise<{ response: Awaited<ReturnType<typeof generateWithRetryDetailed>>['response']; attempts: number; model: string }> {
  if (!backup) {
    const { response, attempts } = await generateWithRetryDetailed(request, log);
    return { response, attempts, model: request.model };
  }
  try {
    const { response, attempts } = await generateWithRetryDetailed(request, log, PRIMARY_ATTEMPTS_WITH_BACKUP);
    return { response, attempts, model: request.model };
  } catch (err) {
    if (!isProviderFailure(err)) throw err;
    const reason = failureReasonOf(err);
    const from = { model: request.model, provider: providerForModel(request.model) };
    const to = { model: backup, provider: providerForModel(backup) };
    logger.warn('LLM call fell back to backup model', { purpose, from, to, reason: reason.kind, clientId: log?.clientId ?? null });
    if (traceStepsEnabled(log)) {
      recordAudit({
        actorType: 'system',
        severity: 'warning',
        agentInstanceId: log!.agentInstanceId,
        clientId: log!.clientId,
        ...fallbackStepOf(purpose, from, reason, to),
      });
    }
    const { response, attempts } = await generateWithRetryDetailed({ ...request, model: backup }, log);
    return { response, attempts, model: backup };
  }
}
