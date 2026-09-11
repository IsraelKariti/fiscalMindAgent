import type { genaiClient } from './client.js';
import { getGeminiModel } from './modelSettings.js';
import { providerForModel, type LlmCallPurpose } from './modelCatalog.js';
import {
  generateWithRetryDetailed,
  usageFromResponse,
  type GeminiUsage,
  type LlmCallLogContext,
} from './generate.js';

type GeminiRequest = Parameters<typeof genaiClient.models.generateContent>[0];

/**
 * The exact request of one LLM stage, minus the model — what a `build*Call`
 * factory returns. Every DoC stage has one (buildFormIntakeCall,
 * buildInjectionScreenCall, buildAnalysisCall, buildExtractionCall,
 * buildDecisionCall) so the app and the evals harness send byte-identical
 * prompts: the runtime does `runLlmCall(build…(), { log })`, the harness does
 * `runLlmCall(build…(), { model, log: { sink } })` and judges the answer with
 * the stage's own code gate.
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
  responseJsonSchema: Record<string, unknown>;
  temperature: number;
}

export interface RunLlmCallOptions {
  /** Per-call llm_calls attribution (or a file sink for the evals harness). */
  log?: Omit<LlmCallLogContext, 'purpose'> & { purpose?: string };
  /** Overrides the admin-selected model for this one call. The app never sets it; the harness does. */
  model?: string;
}

export interface LlmCallResult {
  text: string;
  usage: GeminiUsage;
  /** The model that actually served the call, for per-model usage accounting. */
  model: string;
  provider: string;
  /** Provider round trips this answer took (retries on 429/5xx/timeouts). */
  attempts: number;
}

/**
 * Resolves the model (per-purpose admin setting unless overridden), sends the
 * spec through the shared retry loop and returns the raw answer text. Throws
 * on an empty answer (refusal): every stage needs JSON back.
 */
export async function runLlmCall(spec: LlmCallSpec, opts: RunLlmCallOptions = {}): Promise<LlmCallResult> {
  const model = opts.model ?? (await getGeminiModel(spec.purpose));
  const request: GeminiRequest = {
    model,
    contents: spec.contents,
    config: {
      ...(spec.systemInstruction !== undefined ? { systemInstruction: spec.systemInstruction } : {}),
      responseMimeType: 'application/json',
      responseJsonSchema: spec.responseJsonSchema,
      temperature: spec.temperature,
    },
  };
  const log: LlmCallLogContext | undefined = opts.log ? { ...opts.log, purpose: opts.log.purpose ?? spec.purpose } : undefined;
  const { response, attempts } = await generateWithRetryDetailed(request, log);
  const text = response.text;
  if (!text) {
    throw new Error(`${spec.purpose}: model returned no text (refusal or empty response): ${JSON.stringify(response)}`);
  }
  return { text, usage: usageFromResponse(response), model, provider: providerForModel(model), attempts };
}
