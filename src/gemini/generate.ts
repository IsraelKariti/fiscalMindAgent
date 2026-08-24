import { ApiError, type GenerateContentResponse } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { genaiClient } from './client.js';
import { providerForModel } from './modelSettings.js';
import { computeCost, getPricingForModel } from './pricing.js';
import { requestForLog } from './requestLog.js';
import { generateContentAnthropic } from './anthropic.js';
import { generateContentOpenAI, OpenAiApiError } from './openai.js';
import * as llmCalls from '../db/queries/llmCalls.js';
import { logger } from '../util/logger.js';

// Transient LLM-API failures: rate limit, server error, overloaded ("high demand"), timeout.
const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);
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
 * Attribution for the per-call llm_calls row (049). Call sites that pass it
 * get every call recorded — exact input, response, tokens by kind, and prices
 * at call time; call sites that don't stay counters-only (llmUsage.add).
 */
export interface LlmCallLogContext {
  userId: string | null;
  agentInstanceId: string | null;
  clientId: string | null;
  /** Experiment arm key the call ran under; null outside experiments. */
  variant?: string | null;
  /** e.g. 'conversation_decide' | 'form_intake' | 'verify_document' | 'analyze_file'. */
  purpose: string;
}

/**
 * Persists one llm_calls row for a finished generateWithRetry invocation
 * (success or final failure). Fire-and-forget from the retry loop: a logging
 * failure must never fail — or delay — the call itself.
 */
async function recordCall(
  log: LlmCallLogContext,
  request: GeminiRequest,
  provider: string,
  startedAt: number,
  attempts: number,
  outcome: { response: GenerateContentResponse } | { error: unknown },
): Promise<void> {
  try {
    const usage =
      'response' in outcome
        ? usageFromResponse(outcome.response)
        : { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0 };
    const pricing = await getPricingForModel(request.model);
    await llmCalls.insert({
      userId: log.userId,
      agentInstanceId: log.agentInstanceId,
      clientId: log.clientId,
      variant: log.variant ?? null,
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
      request: requestForLog(request),
      response: 'response' in outcome ? (outcome.response.text ?? null) : null,
    });
  } catch (err) {
    logger.error('llm call logging failed', err, { purpose: log.purpose, clientId: log.clientId });
  }
}

/** Exponential backoff with jitter: ~2s, 4s, 8s, 16s between the 5 attempts. */
export async function generateWithRetry(
  request: GeminiRequest,
  log?: LlmCallLogContext,
): Promise<GenerateContentResponse> {
  const timedRequest = {
    ...request,
    config: {
      ...request.config,
      httpOptions: { timeout: ATTEMPT_TIMEOUT_MS, ...request.config?.httpOptions },
    },
  };
  // GPT/Claude models ride the same retry loop but are served by their own
  // APIs; each translation layer keeps the request/response Gemini-shaped.
  const provider = providerForModel(timedRequest.model);
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const response =
        provider === 'openai'
          ? await generateContentOpenAI(timedRequest)
          : provider === 'anthropic'
            ? await generateContentAnthropic(timedRequest)
            : await genaiClient.models.generateContent(timedRequest);
      if (log) void recordCall(log, timedRequest, provider, startedAt, attempt + 1, { response });
      return response;
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
      if (!retryable || attempt >= MAX_ATTEMPTS - 1) {
        if (log) void recordCall(log, timedRequest, provider, startedAt, attempt + 1, { error: err });
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
