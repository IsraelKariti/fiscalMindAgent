import type { LoggedToolCall } from './requestLog.js';

/**
 * The planner's tool loop, provider-neutral and pure (openspec
 * `planner-answer-tools`, "The planner answers with tool calls"): the model
 * answers a turn with calls and/or text; the caller's `execute` judges and runs
 * the calls and hands back one result per call; the results go back to the
 * model and it answers again. The loop ends when `execute` reports that an
 * accepted terminal call ended the run, when a turn makes no call twice (one
 * corrective user turn in between), or at the turn cap. `send` is injected so
 * the unit tests drive the loop without a provider.
 */

/** One call as the model made it in a turn: the provider's call id (when it gives one), the tool and the raw arguments. */
export interface TranscriptCall {
  id?: string;
  name: string;
  args: unknown;
}

/** The conversation so far, after the prompt: what each adapter translates into its own wire shape. */
export type TranscriptItem =
  | {
      kind: 'model';
      turn: number;
      calls: TranscriptCall[];
      text: string;
      /** The provider's response id (OpenAI: `previous_response_id` of the next turn). */
      responseId?: string;
      /** The provider's own answer blocks, replayed as they were (Anthropic thinking blocks, Gemini thought signatures). */
      raw?: unknown;
    }
  | { kind: 'results'; turn: number; results: ToolCallResult[] }
  | { kind: 'user'; turn: number; text: string };

/** The result text one call is answered with; `id` echoes the call's id when the provider gave one. */
export interface ToolCallResult {
  id?: string;
  name: string;
  output: string;
}

/** What `execute` reports for one turn: a result per call, in call order, and whether an accepted terminal call ended the run. */
export interface ExecuteOutcome {
  results: ToolCallResult[];
  ended: boolean;
}

/** Token usage of one turn, in the Gemini convention (cached ⊂ input; thinking apart from output). */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  /** Cache-write tokens per lifetime, subsets of inputTokens (openspec `llm-call-cache-usage`). Absent = 0. */
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;
}

/** One model turn as the adapter returns it. */
export interface TurnAnswer {
  calls: TranscriptCall[];
  text: string;
  usage: TurnUsage;
  /** The provider's usage block(s) of this turn, as returned. */
  rawUsage?: unknown[];
  responseId?: string;
  raw?: unknown;
}

export type TurnSender = (transcript: readonly TranscriptItem[], turn: number) => Promise<TurnAnswer>;
export type TurnExecutor = (calls: LoggedToolCall[], turn: number) => Promise<ExecuteOutcome>;

export interface ToolLoopOptions {
  /** Model turns in all, the first included. */
  maxTurns: number;
  /** The user turn sent after a turn without calls while the run has no ending yet. */
  correctiveNote: string;
}

/** How the run ended: an accepted terminal call, a second text-only turn, or the turn cap. */
export type LoopEnding = 'terminal' | 'no_ending' | 'cap';

export interface ToolLoopResult {
  /** Every call of every turn, in order, each stamped with its turn and the result it was answered with. */
  calls: LoggedToolCall[];
  /** The text the model wrote per turn (never sent to the client). */
  texts: { turn: number; text: string }[];
  usage: TurnUsage;
  /** The provider's usage block of every turn, in turn order. */
  rawUsage: unknown[];
  turns: number;
  ended: LoopEnding;
}

function addUsage(sum: TurnUsage, u: TurnUsage): void {
  sum.inputTokens += u.inputTokens;
  sum.outputTokens += u.outputTokens;
  sum.thinkingTokens += u.thinkingTokens;
  sum.cachedTokens += u.cachedTokens;
  sum.cacheWrite5mTokens = (sum.cacheWrite5mTokens ?? 0) + (u.cacheWrite5mTokens ?? 0);
  sum.cacheWrite1hTokens = (sum.cacheWrite1hTokens ?? 0) + (u.cacheWrite1hTokens ?? 0);
}

export async function runToolLoop(send: TurnSender, execute: TurnExecutor, opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const transcript: TranscriptItem[] = [];
  const calls: LoggedToolCall[] = [];
  const texts: { turn: number; text: string }[] = [];
  const usage: TurnUsage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 };
  const rawUsage: unknown[] = [];
  let corrected = false;
  for (let turn = 1; turn <= opts.maxTurns; turn++) {
    const answer = await send(transcript, turn);
    addUsage(usage, answer.usage);
    if (answer.rawUsage) rawUsage.push(...answer.rawUsage);
    transcript.push({ kind: 'model', turn, calls: answer.calls, text: answer.text, ...(answer.responseId ? { responseId: answer.responseId } : {}), ...(answer.raw !== undefined ? { raw: answer.raw } : {}) });
    if (answer.text.trim() !== '') texts.push({ turn, text: answer.text });
    if (answer.calls.length === 0) {
      // A turn without calls: once, the model is told the run has no ending yet; twice, the run fails.
      if (corrected) return { calls, texts, usage, rawUsage, turns: turn, ended: 'no_ending' };
      corrected = true;
      transcript.push({ kind: 'user', turn, text: opts.correctiveNote });
      continue;
    }
    const turnCalls: LoggedToolCall[] = answer.calls.map((c) => ({ name: c.name, args: c.args, turn, ...(c.id !== undefined ? { id: c.id } : {}) }));
    const outcome = await execute(turnCalls, turn);
    const results: ToolCallResult[] = answer.calls.map((c, i) => {
      const r = outcome.results[i];
      return { ...(c.id !== undefined ? { id: c.id } : {}), name: c.name, output: r?.output ?? 'done' };
    });
    turnCalls.forEach((c, i) => calls.push({ ...c, result: results[i]!.output }));
    transcript.push({ kind: 'results', turn, results });
    if (outcome.ended) return { calls, texts, usage, rawUsage, turns: turn, ended: 'terminal' };
  }
  return { calls, texts, usage, rawUsage, turns: opts.maxTurns, ended: 'cap' };
}
