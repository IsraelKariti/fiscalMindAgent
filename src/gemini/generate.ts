import { ApiError, type GenerateContentResponse } from '@google/genai';
import { genaiClient } from './client.js';
import { logger } from '../util/logger.js';

// Transient Gemini failures: rate limit, server error, overloaded ("high demand"), timeout.
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
 * Our ATTEMPT_TIMEOUT_MS firing: the SDK aborts the fetch, which rejects with
 * a DOMException named AbortError. We never pass a caller abortSignal, so any
 * abort seen here is the timeout — retry on a fresh connection.
 */
function isTimeoutAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter: ~2s, 4s, 8s, 16s between the 5 attempts. */
export async function generateWithRetry(
  request: Parameters<typeof genaiClient.models.generateContent>[0],
): Promise<GenerateContentResponse> {
  const timedRequest = {
    ...request,
    config: {
      ...request.config,
      httpOptions: { timeout: ATTEMPT_TIMEOUT_MS, ...request.config?.httpOptions },
    },
  };
  for (let attempt = 0; ; attempt++) {
    try {
      return await genaiClient.models.generateContent(timedRequest);
    } catch (err) {
      const retryable =
        (err instanceof ApiError && RETRYABLE_STATUSES.has(err.status)) || isNetworkError(err) || isTimeoutAbort(err);
      if (!retryable || attempt >= MAX_ATTEMPTS - 1) throw err;
      const delayMs = Math.round(BASE_DELAY_MS * 2 ** attempt * (0.5 + Math.random() * 0.5));
      logger.warn('Gemini call failed, retrying', {
        status: err instanceof ApiError ? err.status : isTimeoutAbort(err) ? 'timeout' : 'network',
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
}

/** candidatesTokenCount is the visible output only; thinking tokens are
 *  reported separately (and bill at the output rate). */
export function usageFromResponse(response: GenerateContentResponse): GeminiUsage {
  const meta = response.usageMetadata;
  return {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    thinkingTokens: meta?.thoughtsTokenCount ?? 0,
  };
}
