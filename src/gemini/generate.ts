import { ApiError, type GenerateContentResponse } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { genaiClient } from './client.js';
import { providerForModel } from './modelSettings.js';
import { computeCost, getPricingForModel } from './pricing.js';
import { requestForLog, responseForLog, type ToolContinuation } from './requestLog.js';
import { generateContentAnthropic } from './anthropic.js';
import { generateContentOpenAI, OpenAiApiError } from './openai.js';
import * as llmCalls from '../db/queries/llmCalls.js';
import { assertWithinBudget, LlmBudgetExceededError, noteSpend } from './budget.js';
import { restoreStepOf, traceStepsEnabled, translateStepOf, translationOf, type Translation } from './wireRequest.js';
import { recordAudit } from '../audit/audit.js';
import { appendFile } from 'node:fs/promises';
import { logger } from '../util/logger.js';

// Transient LLM-API failures: rate limit, server error, overloaded ("high demand"),
// timeout, and Gemini's 499 CANCELLED ("The operation was cancelled."), which the
// preview models return for a slow request that the server gave up on.
const RETRYABLE_STATUSES = new Set([429, 499, 500, 503, 504]);
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2_000;

/**
 * Per-attempt deadline. Without it each attempt inherits undici's 300s default
 * headers timeout, so a dead socket (connection made, server never answers)
 * hangs the drafting pipeline for 5 minutes per attempt. The SDK enforces this
 * by aborting the fetch, which surfaces as an AbortError.
 */
const ATTEMPT_TIMEOUT_MS = 60_000;

/**
 * Transport-level failures (the request never got an HTTP response): undici
 * wraps them all in a bare `TypeError: fetch failed` — e.g. a stale keep-alive
 * socket reset by Google's edge after an idle gap, or a DNS/TLS blip. Always
 * safe to retry, since the server never saw the request.
 */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && err.message.includes('fetch failed');
}

/**
 * Our ATTEMPT_TIMEOUT_MS firing: the Gemini SDK aborts the fetch (DOMException
 * named AbortError); the OpenAI path uses AbortSignal.timeout, which rejects
 * with TimeoutError. We never pass a caller abortSignal, so any abort seen
 * here is the timeout — retry on a fresh connection.
 */
function isTimeoutAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiRequest = Parameters<typeof genaiClient.models.generateContent>[0];

/**
 * A Gemini-shaped request plus the optional continuation rule of a tool-call
 * stage (requestLog.ts `ToolContinuation`). Only the OpenAI adapter reads it;
 * the Gemini SDK and the Anthropic adapter get the plain request.
 */
export type LlmRequest = GeminiRequest & { continuation?: ToolContinuation };

/**
 * Attribution for the per-call llm_calls row (049). Call sites that pass it
 * get every call recorded — exact input, response, tokens by kind, and prices
 * at call time; call sites that don't stay counters-only (llmUsage.add).
 */
export interface LlmCallLogContext {
  userId: string | null;
  agentInstanceId: string | null;
  clientId: string | null;
  /**
   * The received file the call reads, when it reads exactly one (splitting,
   * classification, extraction) — the admin trace names the file on the
   * stage chip. Omit for calls that read no single file.
   */
  documentFileId?: string | null;
  /** e.g. 'generate_message' | 'questionnaire_schema_mapping' | 'extract_document' | 'file_classification'. */
  purpose: string;
  /**
   * Where the row goes. Default: the llm_calls table. `{ file }` appends the
   * same row (camelCase, plus `ts`) as one JSON line to that path and never
   * touches Postgres — the evals harness uses it so a run leaves no trace in
   * production observability.
   */
  sink?: 'db' | { file: string };
}

/** One llm_calls row as written to a file sink (the DB columns, camelCase). */
export type LlmCallFileRow = llmCalls.InsertLlmCall & { ts: string };

/**
 * Persists one llm_calls row for a finished generateWithRetry invocation
 * (success or final failure). Fire-and-forget from the retry loop: a logging
 * failure must never fail — or delay — the call itself.
 */
async function recordCall(
  log: LlmCallLogContext,
  request: LlmRequest,
  provider: string,
  translation: Translation | null,
  startedAt: number,
  attempts: number,
  outcome: { response: GenerateContentResponse; traceSteps: boolean } | { error: unknown },
): Promise<void> {
  try {
    const usage =
      'response' in outcome
        ? usageFromResponse(outcome.response)
        : { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0 };
    const pricing = await getPricingForModel(request.model);
    const row: llmCalls.InsertLlmCall = {
      userId: log.userId,
      agentInstanceId: log.agentInstanceId,
      clientId: log.clientId,
      documentFileId: log.documentFileId ?? null,
      purpose: log.purpose,
      provider,
      model: request.model,
      status: 'response' in outcome ? 'ok' : 'error',
      error:
        'error' in outcome
          ? (outcome.error instanceof Error ? outcome.error.message : String(outcome.error)).slice(0, 2000)
          : null,
      attempts,
      durationMs: Date.now() - startedAt,
      ...usage,
      inputPricePerToken: pricing?.inputCostPerToken ?? null,
      outputPricePerToken: pricing?.outputCostPerToken ?? null,
      thinkingPricePerToken: pricing?.thinkingCostPerToken ?? null,
      cachedPricePerToken: pricing?.cachedCostPerToken ?? null,
      cost: pricing ? computeCost(pricing, usage) : null,
      request: requestForLog(request, translation ? (translation.sent as unknown as Record<string, unknown>) : null),
      response: 'response' in outcome ? responseForLog(outcome.response) : null,
    };
    if (log.sink && log.sink !== 'db') {
      const line: LlmCallFileRow = { ts: new Date().toISOString(), ...row };
      await appendFile(log.sink.file, `${JSON.stringify(line)}\n`, 'utf8');
      return;
    }
    noteSpend(log.agentInstanceId, row.cost);
    await llmCalls.insert(row);
    // The adapter put nulls back into the answer (Anthropic, schema stages):
    // the second code step of the translation, timestamped after the call row.
    const restoreStep = 'response' in outcome && outcome.traceSteps ? restoreStepOf(outcome.response, provider, log.purpose, request.model) : null;
    if (restoreStep) {
      recordAudit({ actorType: 'system', severity: 'info', agentInstanceId: log.agentInstanceId, clientId: log.clientId, ...restoreStep });
    }
  } catch (err) {
    logger.error('llm call logging failed', err, { purpose: log.purpose, clientId: log.clientId });
  }
}

/** Exponential backoff with jitter: ~2s, 4s, 8s, 16s between the 5 attempts. */
export async function generateWithRetry(
  request: LlmRequest,
  log?: LlmCallLogContext,
): Promise<GenerateContentResponse> {
  return (await generateWithRetryDetailed(request, log)).response;
}

/**
 * Why a call failed, for the fallback step and the log: the HTTP status the
 * provider answered, or 'timeout' / 'network' when it never answered, or
 * 'error' for anything else, plus the error text.
 */
export function failureReasonOf(err: unknown): { kind: number | 'timeout' | 'network' | 'error'; message: string } {
  const status =
    err instanceof ApiError || err instanceof OpenAiApiError
      ? err.status
      : err instanceof Anthropic.APIError && typeof err.status === 'number'
        ? err.status
        : null;
  const message = err instanceof Error ? err.message : String(err);
  if (status !== null) return { kind: status, message };
  if (isTimeoutAbort(err)) return { kind: 'timeout', message };
  if (isNetworkError(err) || err instanceof Anthropic.APIConnectionError) return { kind: 'network', message };
  return { kind: 'error', message };
}

/**
 * True when the provider failed to serve the call — an API error of any
 * status, a timeout, or a transport failure — i.e. the primary "did not
 * answer" and a backup model may take over (openspec `llm-model-settings`).
 * False for the budget stop (nothing was sent) and for any other error.
 */
export function isProviderFailure(err: unknown): boolean {
  if (err instanceof LlmBudgetExceededError) return false;
  return (
    err instanceof ApiError ||
    err instanceof OpenAiApiError ||
    err instanceof Anthropic.APIError ||
    err instanceof Anthropic.APIConnectionError ||
    isNetworkError(err) ||
    isTimeoutAbort(err)
  );
}

/**
 * generateWithRetry plus how many provider round trips the answer took.
 * `maxAttempts` caps the loop (default MAX_ATTEMPTS); a stage with a backup
 * model gives its primary only 2, one attempt and one retry, before falling
 * back (llmCall.ts · runWithBackup).
 */
export async function generateWithRetryDetailed(
  request: LlmRequest,
  log?: LlmCallLogContext,
  maxAttempts: number = MAX_ATTEMPTS,
): Promise<{ response: GenerateContentResponse; attempts: number; provider: string }> {
  const timedRequest: LlmRequest = {
    ...request,
    config: {
      ...request.config,
      httpOptions: { timeout: ATTEMPT_TIMEOUT_MS, ...request.config?.httpOptions },
    },
  };
  // The Gemini SDK and the Anthropic adapter get the request without the continuation key.
  const { continuation: _continuation, ...providerRequest } = timedRequest;
  void _continuation;
  // GPT/Claude models ride the same retry loop but are served by their own
  // APIs; each translation layer keeps the request/response Gemini-shaped.
  const provider = providerForModel(timedRequest.model);
  // Budget kill switch (budget.ts): a production call (DB-logged) is refused
  // before it is sent once today's ceiling is reached. Harness calls (file
  // sink) carry their own cap and are exempt.
  if (log && (!log.sink || log.sink === 'db')) {
    await assertWithinBudget({ purpose: log.purpose, agentInstanceId: log.agentInstanceId, clientId: log.clientId });
  }
  // What the provider adapter changes before sending (null for Gemini). The
  // sent copy lands in the call row; the changes are a code step of the
  // client's trace, recorded once per call (every attempt sends the same
  // request) and only for a DB-logged call of a client (openspec
  // `conversation-trace`, "adapter translations are code steps").
  const translation = translationOf(provider, timedRequest);
  const traceSteps = traceStepsEnabled(log);
  const translateStep = traceSteps ? translateStepOf(translation, log!.purpose, timedRequest.model) : null;
  if (translateStep) {
    recordAudit({ actorType: 'system', severity: 'info', agentInstanceId: log!.agentInstanceId, clientId: log!.clientId, ...translateStep });
  }
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const response =
        provider === 'openai'
          ? await generateContentOpenAI(timedRequest)
          : provider === 'anthropic'
            ? await generateContentAnthropic(providerRequest)
            : await genaiClient.models.generateContent(providerRequest);
      // DB sink: fire-and-forget (logging never delays the call). File sink
      // (the evals harness): awaited, so a process that exits right after its
      // last answer still has every row on disk. The restore step (the nulls
      // the adapter put back) is recorded inside, after the call row, so the
      // trace reads translate → call → restore.
      if (log) {
        const recorded = recordCall(log, timedRequest, provider, translation, startedAt, attempt + 1, { response, traceSteps });
        if (log.sink && log.sink !== 'db') await recorded;
        else void recorded;
      }
      return { response, attempts: attempt + 1, provider };
    } catch (err) {
      const apiStatus =
        err instanceof ApiError || err instanceof OpenAiApiError
          ? err.status
          : err instanceof Anthropic.APIError && typeof err.status === 'number'
            ? err.status
            : null;
      const retryable =
        (apiStatus !== null && RETRYABLE_STATUSES.has(apiStatus)) ||
        isNetworkError(err) ||
        isTimeoutAbort(err) ||
        // The Anthropic SDK wraps transport failures/timeouts in its own classes.
        err instanceof Anthropic.APIConnectionError;
      if (!retryable || attempt >= maxAttempts - 1) {
        if (log) void recordCall(log, timedRequest, provider, translation, startedAt, attempt + 1, { error: err });
        throw err;
      }
      const delayMs = Math.round(BASE_DELAY_MS * 2 ** attempt * (0.5 + Math.random() * 0.5));
      logger.warn('LLM call failed, retrying', {
        status: apiStatus ?? (isTimeoutAbort(err) ? 'timeout' : 'network'),
        cause: err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined,
        attempt,
        delayMs,
      });
      await sleep(delayMs);
    }
  }
}

export interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  /** Prompt-cache read tokens — a SUBSET of inputTokens, billed at the cached rate. */
  cachedTokens: number;
}

/** candidatesTokenCount is the visible output only; thinking tokens are
 *  reported separately (and bill at the output rate). cachedContentTokenCount
 *  is included in promptTokenCount on every provider's translation layer. */
export function usageFromResponse(response: GenerateContentResponse): GeminiUsage {
  const meta = response.usageMetadata;
  return {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    thinkingTokens: meta?.thoughtsTokenCount ?? 0,
    cachedTokens: meta?.cachedContentTokenCount ?? 0,
  };
}
