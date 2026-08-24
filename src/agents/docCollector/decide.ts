import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../../util/logger.js';
import { getGeminiModel } from '../../gemini/modelSettings.js';
import {
  generateWithRetry,
  usageFromResponse,
  type GeminiUsage,
  type LlmCallLogContext,
} from '../../gemini/generate.js';
import {
  correctionSuffix,
  DecisionResponseSchema,
  EMAIL_ONLY_CONTEXT,
  normalizeDecision,
  type DecisionContext,
  type NormalizedDecision,
} from './decisionSchema.js';

const decisionJsonSchema = zodToJsonSchema(DecisionResponseSchema) as Record<string, unknown>;
delete decisionJsonSchema.$schema;

export type { GeminiUsage };

export interface DecideResult {
  decision: NormalizedDecision;
  usage: GeminiUsage;
  /** The model that actually served this call, for per-model usage accounting. */
  model: string;
}

/** First answer + one corrective pass; the second rejection propagates. */
const MAX_DECISION_ATTEMPTS = 2;

export async function decide(
  systemInstruction: string,
  contents: string,
  ctx: DecisionContext = EMAIL_ONLY_CONTEXT,
  opts: {
    /** Experiment-arm model override (049); default = the global admin-picked model. */
    model?: string;
    /** Per-call llm_calls attribution; each validation attempt logs its own row. */
    log?: LlmCallLogContext;
  } = {},
): Promise<DecideResult> {
  const model = opts.model ?? (await getGeminiModel('conversation_decide'));
  const usage: GeminiUsage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0 };
  let requestContents = contents;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_DECISION_ATTEMPTS; attempt++) {
    const response = await generateWithRetry(
      {
        model,
        contents: requestContents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: decisionJsonSchema,
          temperature: 0.3,
        },
      },
      opts.log,
    );

    const callUsage = usageFromResponse(response);
    usage.inputTokens += callUsage.inputTokens;
    usage.outputTokens += callUsage.outputTokens;
    usage.thinkingTokens += callUsage.thinkingTokens;
    usage.cachedTokens += callUsage.cachedTokens;
    logger.info('gemini tokens used', { model, ...callUsage });

    const text = response.text;
    if (!text) {
      throw new Error(`Gemini returned no text output (refusal or empty response): ${JSON.stringify(response)}`);
    }
    try {
      const raw = DecisionResponseSchema.parse(JSON.parse(text));
      return { decision: normalizeDecision(raw, ctx), usage, model };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_DECISION_ATTEMPTS) {
        logger.warn('decision rejected by validation; retrying once with corrective feedback', {
          error: err instanceof Error ? err.message : String(err),
        });
        requestContents = `${contents}${correctionSuffix(text, err)}`;
      }
    }
  }
  throw lastError;
}
