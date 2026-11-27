import { logger } from '../../util/logger.js';
import type { GeminiUsage, LlmCallLogContext } from '../../gemini/generate.js';
import { runLlmCall, type LlmCallSpec, type TurnExecutor } from '../../gemini/llmCall.js';
import type { LoopEnding } from '../../gemini/toolLoop.js';
import type { DecisionContext } from './decisionSchema.js';
import { decisionToolsKey, endingCorrectionNote, TERMINAL_TOOL_NAMES, toolJsonSchemas, type DecisionToolJson, type ToolCall } from './decisionTools.js';

/**
 * Per-context tool sets (openspec `planner-answer-tools`): the full set minus
 * the tools the context can never use (decisionTools.ts), keyed by the tool
 * names offered. Every provider gets the same flat tools; the planner runs a
 * tool loop (gemini/toolLoop.ts): the calls of every turn are judged and
 * executed by the caller's `execute` and answered with their results, until
 * an accepted terminal call ends the run, at most MAX_TOOL_TURNS turns.
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
  /** Every call of every turn, in order, each with its turn and the result it was answered with. */
  calls: ToolCall[];
  /** The text the model wrote per turn (never sent to the client). */
  texts: { turn: number; text: string }[];
  usage: GeminiUsage;
  /** The model that actually served this call, for per-model usage accounting. */
  model: string;
  turns: number;
  /** How the run ended: an accepted terminal call, a second text-only turn, or the turn cap. */
  ended: LoopEnding;
}

export interface DecisionCallInput {
  /** The rendered agent prompt (+ keepalive contract + untrusted-data doctrine). */
  systemInstruction: string;
  /** The fenced data sections (checklist, questionnaire, thread). */
  contents: string;
  ctx: DecisionContext;
  /** Judges and executes the calls of one turn (plan.ts `executeTurn`; the evals harness plays canned results). */
  execute: TurnExecutor;
}

/** The exact planner request — shared with the evals harness so it tests what the app sends. */
export function buildDecisionCall({ systemInstruction, contents, ctx, execute }: DecisionCallInput): {
  spec: LlmCallSpec;
  tools: DecisionToolJson[];
} {
  const tools = decisionToolsForContext(ctx);
  return {
    spec: {
      purpose: 'planner',
      systemInstruction,
      contents,
      tools,
      execute,
      terminalTools: [...TERMINAL_TOOL_NAMES],
      correctiveNote: endingCorrectionNote(),
      temperature: 0.3,
    },
    tools,
  };
}

/**
 * One planner run: the loop, with `execute` judging and running every turn's
 * calls. The gate rows (`validate_message`, one per turn) and the tool steps
 * are written by `execute`; this only runs the call and bills the usage.
 */
export async function decide(
  systemInstruction: string,
  contents: string,
  ctx: DecisionContext,
  execute: TurnExecutor,
  opts: {
    /** Per-call llm_calls attribution; the run logs one row. */
    log?: LlmCallLogContext;
  } = {},
): Promise<DecideResult> {
  const { spec } = buildDecisionCall({ systemInstruction, contents, ctx, execute });
  const result = await runLlmCall(spec, { log: opts.log });
  logger.info('planner run finished', { model: result.model, turns: result.turns, ended: result.ended, ...result.usage });
  return {
    calls: result.toolCalls,
    texts: result.texts,
    usage: result.usage,
    model: result.model,
    turns: result.turns,
    ended: result.ended ?? 'terminal',
  };
}
