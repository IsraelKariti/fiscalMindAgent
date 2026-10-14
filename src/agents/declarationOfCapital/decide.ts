import { logger } from '../../util/logger.js';
import type { GeminiUsage, LlmCallLogContext } from '../../gemini/generate.js';
import { runLlmCall, type LlmCallSpec } from '../../gemini/llmCall.js';
import { recordAudit } from '../../audit/audit.js';
import { check } from '../shared/gateChecks.js';
import { DecisionRejectedError, type DecisionContext, type NormalizedDecision } from './decisionSchema.js';
import {
  correctionSuffix,
  decisionToolsKey,
  describeCalls,
  gateDecision,
  toolJsonSchemas,
  type DecisionToolJson,
  type ToolCall,
} from './decisionTools.js';

/**
 * Per-context tool sets (openspec `planner-answer-tools`): the full set minus
 * the tools the context can never use (decisionTools.ts), keyed by the tool
 * names offered. Every provider gets the same flat tools; the planner answers
 * with one or more calls — in a single turn on Gemini and Anthropic, over up
 * to MAX_TOOL_TURNS turns on OpenAI (llmCall.ts).
 */
const toolsCache = new Map<string, DecisionToolJson[]>();

/** The tools sent to the model for one context, as name + description + flat JSON-schema parameters. */
export function decisionToolsForContext(ctx: DecisionContext): DecisionToolJson[] {
  const key = decisionToolsKey(ctx);
  let entry = toolsCache.get(key);
  if (!entry) {
    entry = toolJsonSchemas(ctx);
    toolsCache.set(key, entry);
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
  tools: DecisionToolJson[];
} {
  const tools = decisionToolsForContext(ctx);
  return {
    spec: {
      purpose: 'generate_message',
      systemInstruction,
      contents,
      tools,
      // `conclude` closes the answer: a provider whose model makes one call per
      // turn (OpenAI) is asked again until it arrives.
      finalTool: 'conclude',
      temperature: 0.3,
    },
    tools,
  };
}

export async function decide(
  systemInstruction: string,
  contents: string,
  ctx: DecisionContext,
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
    const { spec } = buildDecisionCall({ systemInstruction, contents: requestContents, ctx });
    const result = await runLlmCall(spec, { log: opts.log });
    model = result.model;
    const { usage: callUsage } = result;
    const calls: ToolCall[] = result.toolCalls;
    usage.inputTokens += callUsage.inputTokens;
    usage.outputTokens += callUsage.outputTokens;
    usage.thinkingTokens += callUsage.thinkingTokens;
    usage.cachedTokens += callUsage.cachedTokens;
    logger.info('gemini tokens used', { model, ...callUsage });

    // Step validate_message: the two checks in order — `tool_calls` (offered
    // tools, per-tool schema, exactly one conclude) then `business_rules`
    // (assembly + normalizeDecision: evidence quotes, instance caps, message
    // rules, attestation gate). One audit row per attempt with the verdict; a
    // rejection is fed back for one corrective pass.
    try {
      const { decision, checks } = gateDecision(calls, ctx);
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
          checks: err instanceof DecisionRejectedError ? err.checks : [check('tool_calls', false, message, { observed: describeCalls(calls) })],
        },
      });
      if (attempt < MAX_DECISION_ATTEMPTS) {
        logger.warn('decision rejected by validation; retrying once with corrective feedback', {
          error: err instanceof Error ? err.message : String(err),
        });
        requestContents = `${contents}${correctionSuffix(calls, err)}`;
      }
    }
  }
  throw lastError;
}
