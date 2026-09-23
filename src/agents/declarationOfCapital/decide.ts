import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../../util/logger.js';
import type { GeminiUsage, LlmCallLogContext } from '../../gemini/generate.js';
import { runLlmCall, type LlmCallSpec } from '../../gemini/llmCall.js';
import { recordAudit } from '../../audit/audit.js';
import { check } from '../shared/gateChecks.js';
import {
  correctionSuffix,
  DecisionRejectedError,
  decisionSchemaForContext,
  decisionSchemaKey,
  EMAIL_ONLY_CONTEXT,
  gateDecision,
  type DecisionContext,
  type DecisionResponse,
  type NormalizedDecision,
} from './decisionSchema.js';
import type { z } from 'zod';

/**
 * Per-context response schemas (the full contract minus the field groups the
 * context can never accept — see decisionSchema.ts), keyed by the pruned-field
 * set. Pruning keeps the schema under Anthropic's structured-output complexity
 * budget; Gemini/OpenAI simply get the smaller schema too.
 */
const schemaCache = new Map<string, { zod: z.ZodType<Partial<DecisionResponse>>; json: Record<string, unknown> }>();

function schemasForContext(ctx: DecisionContext): { zod: z.ZodType<Partial<DecisionResponse>>; json: Record<string, unknown> } {
  const key = decisionSchemaKey(ctx);
  let entry = schemaCache.get(key);
  if (!entry) {
    const zodSchema = decisionSchemaForContext(ctx);
    const json = zodToJsonSchema(zodSchema as never) as Record<string, unknown>;
    delete json.$schema;
    entry = { zod: zodSchema, json };
    schemaCache.set(key, entry);
  }
  return entry;
}

export type { GeminiUsage };

export interface DecideResult {
  decision: NormalizedDecision;
  usage: GeminiUsage;
  /** The model that actually served this call, for per-model usage accounting. */
  model: string;
}

/** First answer + one corrective pass; the second rejection propagates. */
const MAX_DECISION_ATTEMPTS = 2;

export interface DecisionCallInput {
  /** The rendered agent prompt (+ keepalive contract + untrusted-data doctrine). */
  systemInstruction: string;
  /** The fenced data sections (checklist, questionnaire, thread), possibly with a correction suffix. */
  contents: string;
  ctx: DecisionContext;
}

/** The exact generate_message request — shared with the evals harness so it tests what the app sends. */
export function buildDecisionCall({ systemInstruction, contents, ctx }: DecisionCallInput): {
  spec: LlmCallSpec;
  schema: z.ZodType<Partial<DecisionResponse>>;
} {
  const schemas = schemasForContext(ctx);
  return {
    spec: {
      purpose: 'generate_message',
      systemInstruction,
      contents,
      responseJsonSchema: schemas.json,
      temperature: 0.3,
    },
    schema: schemas.zod,
  };
}

export async function decide(
  systemInstruction: string,
  contents: string,
  ctx: DecisionContext = EMAIL_ONLY_CONTEXT,
  opts: {
    /** Per-call llm_calls attribution; each validation attempt logs its own row. */
    log?: LlmCallLogContext;
  } = {},
): Promise<DecideResult> {
  const usage: GeminiUsage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0 };
  let requestContents = contents;
  let lastError: unknown;
  let model = '';
  for (let attempt = 1; attempt <= MAX_DECISION_ATTEMPTS; attempt++) {
    const { spec, schema } = buildDecisionCall({ systemInstruction, contents: requestContents, ctx });
    const result = await runLlmCall(spec, { log: opts.log });
    model = result.model;
    const { text, usage: callUsage } = result;
    usage.inputTokens += callUsage.inputTokens;
    usage.outputTokens += callUsage.outputTokens;
    usage.thinkingTokens += callUsage.thinkingTokens;
    usage.cachedTokens += callUsage.cachedTokens;
    logger.info('gemini tokens used', { model, ...callUsage });

    // Step validate_message: schema parse + normalizeDecision (evidence quotes,
    // instance caps, channel rules, attestation gate). One audit row per
    // attempt with the verdict; a rejection is fed back for one corrective pass.
    // gateDecision runs the two checks in order (`json_schema`, then
    // `business_rules`) and, on rejection, throws with the checks that ran.
    try {
      const { decision, checks } = gateDecision(text, schema, ctx);
      recordAudit({
        actorType: 'system',
        action: 'validate_message',
        agentInstanceId: opts.log?.agentInstanceId ?? null,
        clientId: opts.log?.clientId ?? null,
        detail: {
          attempt,
          result: true,
          decision: decision.decision,
          resolutions: decision.resolutions.length,
          added: decision.addedInstances.length,
          retired: decision.retired.length,
          collected: decision.collected_document_ids,
          attestation: decision.attestation?.action ?? null,
          checks,
        },
      });
      return { decision, usage, model };
    } catch (err) {
      lastError = err;
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      recordAudit({
        actorType: 'system',
        action: 'validate_message',
        agentInstanceId: opts.log?.agentInstanceId ?? null,
        clientId: opts.log?.clientId ?? null,
        severity: 'warning',
        detail: {
          attempt,
          result: false,
          error: message,
          checks: err instanceof DecisionRejectedError ? err.checks : [check('json_schema', false, message)],
        },
      });
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
