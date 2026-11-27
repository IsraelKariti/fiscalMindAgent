import type { GenerateContentResponse } from '@google/genai';
import type { genaiClient } from './client.js';
import { getGeminiModel, resolveBackupModel } from './modelSettings.js';
import { providerForModel, type LlmCallPurpose } from './modelCatalog.js';
import {
  failureReasonOf,
  generateWithRetryDetailed,
  isProviderFailure,
  recordLlmCall,
  usageFromResponse,
  type GeminiUsage,
  type LlmCallLogContext,
  type LlmRequest,
  type RetryOptions,
} from './generate.js';
import { toolCallsOf, type LoggedToolCall } from './requestLog.js';
import { runToolLoop, type LoopEnding, type TranscriptCall, type TranscriptItem, type TurnAnswer, type TurnExecutor } from './toolLoop.js';
import { callsFromGeminiParts, toolRequestConfig, type LlmToolSpec } from './toolTransport.js';
import { fallbackLogOf, fallbackStepOf, traceStepsEnabled, translationOf } from './wireRequest.js';
import { getHolds, openHold, ProviderHeldError } from './providerOutage.js';
import { holdsAfterFailures, routeUnderHold, type CallFailure } from './outageRules.js';
import { recordAudit } from '../audit/audit.js';
import { logger } from '../util/logger.js';

type GeminiRequest = Parameters<typeof genaiClient.models.generateContent>[0];

export type { LlmToolSpec, TurnExecutor };

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
 * tool calls (`tools`, openspec `planner-answer-tools`): the model may call
 * the tools or answer in text; with `execute` the stage runs a tool loop
 * (toolLoop.ts) — every turn's calls are judged and executed by `execute`,
 * answered with their real results, and the model answers again until an
 * accepted terminal call ends the run, at most MAX_TOOL_TURNS turns. Exactly
 * one of the two answer kinds is set.
 *
 * Builders take plain data (rows, bytes, sanitized text) and import nothing
 * from db/, so they can run without a database.
 */
export interface LlmCallSpec {
  /** The stage; 'outage_probe' is the hold probe (providerOutage), which pins its model and has no admin setting. */
  purpose: LlmCallPurpose | 'outage_probe';
  /** Trusted instructions (rules, catalog, expected-document context). */
  systemInstruction?: string;
  /** The user turn(s): untrusted client data only, fenced/sanitized by the builder. */
  contents: GeminiRequest['contents'];
  /** JSON schema the answer must satisfy (zod-to-json-schema output, $schema removed). */
  responseJsonSchema?: Record<string, unknown>;
  /** The tools the model may answer with (tool choice left to the model, parallel calls allowed). */
  tools?: LlmToolSpec[];
  /** Judges and executes the calls of one turn and returns their results; the loop runs while it is set. Only with `tools`. */
  execute?: TurnExecutor;
  /** The tools whose accepted call ends the run — recorded on the call row as the loop rule. Only with `execute`. */
  terminalTools?: string[];
  /** The user turn sent after a turn without calls while the run has no ending yet. Only with `execute`. */
  correctiveNote?: string;
  temperature: number;
}

/** Model turns one tool loop may take in all, the first included; reached without an ending, the run fails. */
export const MAX_TOOL_TURNS = 12;

export interface RunLlmCallOptions {
  /** Per-call llm_calls attribution (or a file sink for the evals harness). */
  log?: Omit<LlmCallLogContext, 'purpose'> & { purpose?: string };
  /** Overrides the admin-selected model for this one call. The app never sets it; the harness and the outage probe do. */
  model?: string;
  /** The outage probe (openspec `llm-provider-outage`): bypasses the hold check and never opens a hold itself. */
  probe?: boolean;
}

/** One tool call the model made: the tool's name and its raw arguments (plus the turn and the result, in a loop). */
export type LlmToolCall = LoggedToolCall;

export interface LlmCallResult {
  /** The answer text of a form-answer stage; '' for a tool-call stage. */
  text: string;
  /** The calls of a tool-call stage, in the order the model made them; [] for a form-answer stage. */
  toolCalls: LlmToolCall[];
  /** The text the model wrote per turn of a tool loop; [] otherwise. */
  texts: { turn: number; text: string }[];
  usage: GeminiUsage;
  /** The model that actually served the call, for per-model usage accounting. */
  model: string;
  provider: string;
  /** Provider round trips this answer took (retries on 429/5xx/timeouts; every turn of a loop counted). */
  attempts: number;
  /** Model turns of a tool loop; 1 otherwise. */
  turns: number;
  /** How a tool loop ended; absent for a single answer. */
  ended?: LoopEnding;
}

/** The Gemini-shaped request config of a spec: a response schema, or tools. */
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

/** The adapters' extra fields on a tool-call answer (anthropic.ts, openai.ts): the provider's own blocks and the response id. */
interface ProviderTurnFields {
  providerTurn?: unknown;
  responseId?: string;
}

/** One model turn as the loop reads it off a provider answer. */
function turnAnswerOf(response: GenerateContentResponse & ProviderTurnFields): TurnAnswer {
  const parts = response.candidates?.[0]?.content?.parts;
  const calls: TranscriptCall[] = response.functionCalls
    ? toolCallsOf(response).map((c) => ({ ...(c.id !== undefined ? { id: c.id } : {}), name: c.name, args: c.args }))
    : callsFromGeminiParts(parts);
  const text = calls.length > 0 && !response.functionCalls ? (parts ?? []).flatMap((p) => (p.text ? [p.text] : [])).join('') : (response.text ?? '');
  const raw = response.providerTurn ?? parts;
  return {
    calls,
    text,
    usage: usageFromResponse(response),
    ...(response.responseId ? { responseId: response.responseId } : {}),
    ...(raw !== undefined ? { raw } : {}),
  };
}

/**
 * Resolves the model (per-purpose admin setting unless overridden), sends the
 * spec through the shared retry loop and returns the raw answer: the text of a
 * form-answer stage (throws on an empty answer — a refusal — since every such
 * stage needs JSON back), or the tool calls of a tool-call stage. With
 * `execute`, the tool loop runs here: the first turn goes through the hold
 * check and the backup model like any call; the later turns stay on the model
 * that answered; one llm_calls row records every turn's calls with their
 * results and the summed usage.
 */
export async function runLlmCall(spec: LlmCallSpec, opts: RunLlmCallOptions = {}): Promise<LlmCallResult> {
  if (spec.purpose === 'outage_probe' && !opts.model) throw new Error('outage_probe: the probe pins its model');
  const stage = spec.purpose as LlmCallPurpose;
  const primary = opts.model ?? (await getGeminiModel(stage));
  if (spec.execute && !spec.tools) throw new Error(`${spec.purpose}: execute needs tools`);
  const request: LlmRequest = {
    model: primary,
    contents: spec.contents,
    config: requestConfigOf(spec),
    ...(spec.execute ? { continuation: { terminalTools: spec.terminalTools ?? [], maxTurns: MAX_TOOL_TURNS } } : {}),
  };
  let log: LlmCallLogContext | undefined = opts.log ? { ...opts.log, purpose: opts.log.purpose ?? spec.purpose } : undefined;
  // A pinned model (the evals harness, the probe) is the only one tried.
  let backup = opts.model ? null : await resolveBackupModel(stage, primary);
  // The hold check (openspec `llm-provider-outage`): a held provider gets no
  // request. Only the primary held and a backup on a free provider → the
  // backup takes the call straight away (a fallback step says why); nothing
  // free → refused before anything is sent. The probe bypasses the check.
  if (!opts.probe) {
    const holds = await getHolds();
    const route = routeUnderHold(holds, providerForModel(primary), backup ? providerForModel(backup) : null);
    if (route.route === 'held') throw new ProviderHeldError(route.provider, route.kind, holds[route.provider]?.message ?? '');
    if (route.route === 'backup' && backup) {
      const hold = holds[providerForModel(primary)];
      const from = { model: primary, provider: providerForModel(primary) };
      const to = { model: backup, provider: providerForModel(backup) };
      const reason = { kind: 'held' as const, message: `${hold?.kind ?? 'held'}: ${hold?.message ?? ''}` };
      logger.warn('LLM call routed to the backup model: primary provider held', {
        purpose: spec.purpose,
        from,
        to,
        kind: hold?.kind,
        clientId: log?.clientId ?? null,
      });
      if (traceStepsEnabled(log)) {
        recordAudit({
          actorType: 'system',
          severity: 'warning',
          agentInstanceId: log!.agentInstanceId,
          clientId: log!.clientId,
          ...fallbackStepOf(spec.purpose, from, reason, to),
        });
      }
      request.model = backup;
      backup = null;
      // The backup's row carries the fallback mark (openspec `fallbacks-dashboard`).
      log = fallbackLogOf(log, from, reason);
    }
  }
  if (spec.execute) return runToolCallLoop(spec, request, backup, log, opts);
  const failures: CallFailure[] = [];
  let outcome: Awaited<ReturnType<typeof runWithBackup>>;
  try {
    outcome = await runWithBackup(spec.purpose, request, backup, log, failures);
  } catch (err) {
    throw opts.probe ? err : await holdAfterFailure(spec.purpose, failures, err);
  }
  const { response, attempts, model } = outcome;
  const usage = usageFromResponse(response);
  const provider = providerForModel(model);
  if (spec.tools) {
    return { text: '', toolCalls: toolCallsOf(response), texts: [], usage, model, provider, attempts, turns: 1 };
  }
  const text = response.text;
  if (!text) {
    throw new Error(`${spec.purpose}: model returned no text (refusal or empty response): ${JSON.stringify(response)}`);
  }
  return { text, toolCalls: [], texts: [], usage, model, provider, attempts, turns: 1 };
}

/**
 * The tool loop of a stage with `execute` (openspec `planner-answer-tools`):
 * turn 1 is sent like any call (hold check done by the caller, backup model,
 * fallback step); every later turn replays the transcript on the model that
 * answered turn 1, with the same retry policy and no row of its own. One
 * llm_calls row is written at the end — the calls of every turn with their
 * results, the texts, the summed usage, the fallback mark when the backup
 * served — or an error row when a turn failed for good.
 */
async function runToolCallLoop(
  spec: LlmCallSpec,
  request: LlmRequest,
  backup: string | null,
  log: LlmCallLogContext | undefined,
  opts: RunLlmCallOptions,
): Promise<LlmCallResult> {
  const startedAt = Date.now();
  const failures: CallFailure[] = [];
  let served: { model: string; log: LlmCallLogContext | undefined } | null = null;
  let attempts = 0;
  const noRow: RetryOptions = { record: false };
  const send = async (transcript: readonly TranscriptItem[], turn: number): Promise<TurnAnswer> => {
    if (turn === 1) {
      const first = await runWithBackup(spec.purpose, request, backup, log, failures, noRow);
      served = { model: first.model, log: first.log };
      attempts += first.attempts;
      return turnAnswerOf(first.response as GenerateContentResponse & ProviderTurnFields);
    }
    const later = await generateWithRetryDetailed({ ...request, model: served!.model, transcript }, served!.log, undefined, { record: false, translateStep: false });
    attempts += later.attempts;
    return turnAnswerOf(later.response as GenerateContentResponse & ProviderTurnFields);
  };
  const recordRow = (outcome: { response: GenerateContentResponse } | { error: unknown }) => {
    const rowLog = served?.log ?? log;
    if (!rowLog) return;
    const rowRequest = { ...request, model: served?.model ?? request.model };
    const provider = providerForModel(rowRequest.model);
    const translation = translationOf(provider, rowRequest);
    const traceSteps = traceStepsEnabled(rowLog);
    const recorded = recordLlmCall(rowLog, rowRequest, provider, translation, startedAt, attempts, 'response' in outcome ? { response: outcome.response, traceSteps } : outcome);
    return rowLog.sink && rowLog.sink !== 'db' ? recorded : void recorded;
  };
  let loop: Awaited<ReturnType<typeof runToolLoop>>;
  try {
    loop = await runToolLoop(send, spec.execute!, { maxTurns: MAX_TOOL_TURNS, correctiveNote: spec.correctiveNote ?? DEFAULT_CORRECTIVE_NOTE });
  } catch (err) {
    await recordRow({ error: err });
    throw opts.probe ? err : await holdAfterFailure(spec.purpose, failures, err);
  }
  const model = served!.model;
  const provider = providerForModel(model);
  const usage: GeminiUsage = { ...loop.usage };
  // The row's response: every call with its turn and result, the texts, and the summed usage in the Gemini convention.
  const synthesized = {
    functionCalls: loop.calls,
    texts: loop.texts,
    text: loop.texts.map((t) => t.text).join('\n') || undefined,
    usageMetadata: {
      promptTokenCount: usage.inputTokens,
      candidatesTokenCount: usage.outputTokens,
      thoughtsTokenCount: usage.thinkingTokens,
      cachedContentTokenCount: usage.cachedTokens,
    },
  } as unknown as GenerateContentResponse;
  await recordRow({ response: synthesized });
  if (loop.turns > 1) logger.info('tool loop finished', { purpose: spec.purpose, model, turns: loop.turns, ended: loop.ended, calls: loop.calls.map((c) => c.name) });
  return { text: '', toolCalls: loop.calls, texts: loop.texts, usage, model, provider, attempts, turns: loop.turns, ended: loop.ended };
}

/** The corrective note of a stage that gave none: the loop needs an ending. */
const DEFAULT_CORRECTIVE_NOTE = 'SYSTEM NOTE: your last turn made no tool call and the run has no ending yet. Your text is not sent to anyone. Call the tools; end the run with a terminal tool.';

/** The primary gets one attempt and one retry when a backup stands behind it. */
const PRIMARY_ATTEMPTS_WITH_BACKUP = 2;

/**
 * Sends the request on its model and, when the stage has a backup model and
 * the primary did not answer (openspec `llm-model-settings`), sends the same
 * request once more on the backup with the full retry loop. The primary's
 * failed call keeps its own error row; the switch is a `fallback_model` step
 * of the client's trace (never for the evals harness); the backup's call row
 * and result name the backup model. Only a provider failure switches: the
 * budget stop and any other error propagate as they are. Returns the log the
 * served model's row uses (the backup's carries the fallback mark).
 */
async function runWithBackup(
  purpose: string,
  request: LlmRequest,
  backup: string | null,
  log: LlmCallLogContext | undefined,
  failures: CallFailure[],
  retry: RetryOptions = {},
): Promise<{ response: Awaited<ReturnType<typeof generateWithRetryDetailed>>['response']; attempts: number; model: string; log: LlmCallLogContext | undefined }> {
  if (!backup) {
    try {
      const { response, attempts } = await generateWithRetryDetailed(request, log, undefined, retry);
      return { response, attempts, model: request.model, log };
    } catch (err) {
      failures.push({ model: request.model, err });
      throw err;
    }
  }
  try {
    const { response, attempts } = await generateWithRetryDetailed(request, log, PRIMARY_ATTEMPTS_WITH_BACKUP, retry);
    return { response, attempts, model: request.model, log };
  } catch (err) {
    failures.push({ model: request.model, err });
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
    // The backup's row carries the fallback mark (openspec `fallbacks-dashboard`); the primary's row stays unmarked.
    const backupLog = fallbackLogOf(log, from, reason);
    try {
      const { response, attempts } = await generateWithRetryDetailed({ ...request, model: backup }, backupLog, undefined, retry);
      return { response, attempts, model: backup, log: backupLog };
    } catch (backupErr) {
      failures.push({ model: backup, err: backupErr });
      throw backupErr;
    }
  }
}

/**
 * After every model of the call failed (openspec `llm-provider-outage`): each
 * failure that proves the provider is down for a reason on our side opens the
 * hold on that provider (the budget stop opens the 'budget' hold). The stage
 * then gets a ProviderHeldError, so it holds its work instead of judging it;
 * a failure that proves nothing (a timeout, a bad request of ours) is thrown
 * as it is and the stage fails as before.
 */
async function holdAfterFailure(purpose: string, failures: CallFailure[], err: unknown): Promise<unknown> {
  const holds = holdsAfterFailures(failures);
  if (holds.length === 0) return err;
  for (const hold of holds) {
    try {
      await openHold(hold.provider, { kind: hold.kind, message: hold.message, model: hold.model, purpose });
    } catch (openErr) {
      logger.error('could not record the provider outage hold', openErr, { purpose, provider: hold.provider });
    }
  }
  const first = holds[0]!;
  return new ProviderHeldError(first.provider, first.kind, first.message);
}
