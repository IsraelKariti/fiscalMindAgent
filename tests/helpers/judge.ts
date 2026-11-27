import { judgeRun, type JudgedRun } from '../../src/agents/declarationOfCapital/decisionJudge.js';
import { DecisionRejectedError, type DecisionContext, type NormalizedChanges } from '../../src/agents/declarationOfCapital/decisionSchema.js';
import { describeCall, describeCalls, type ToolCall } from '../../src/agents/declarationOfCapital/decisionTools.js';
import { check, type GateCheck } from '../../src/agents/shared/gateChecks.js';
import { callsOf, type TestAnswer } from './decisionCalls.js';

/**
 * Test helper over the pure judge (decisionJudge.ts `judgeRun`): the calls of a
 * run judged at once, with the gate-row checks plan.ts would write for one
 * turn — `tool_calls`, one `business_rules` per call, `ending` — and the old
 * tests' shape: a `decision` label for the ending and the normalized changes.
 * Throws DecisionRejectedError (carrying the checks) on the first refusal, so
 * the many `assert.throws(/…/)` tests keep their meaning.
 */
export interface GatedAnswer extends NormalizedChanges {
  decision: 'follow_up' | 'goal_complete' | 'client_declined' | 'none';
  reasoning: string;
  message: JudgedRun['message'] extends infer M ? (M extends { message: infer X } ? X : never) | null : never;
  send_at: string | null;
}

export function checksOf(run: JudgedRun, calls: readonly ToolCall[], nameOf: (id: string) => string | undefined = () => undefined): GateCheck[] {
  const shapeFaults = run.refusals.filter((r) => !run.accepted.includes(r.call as never));
  const checks: GateCheck[] = [
    check('tool_calls', shapeFaults.length === 0, shapeFaults.length > 0 ? shapeFaults.map((f) => f.reason).join(' · ') : null, { observed: describeCalls(calls) }),
    ...run.checks,
  ];
  for (const call of run.accepted) {
    const refusal = run.refusals.find((r) => r.call === call);
    checks.push(check('business_rules', !refusal, refusal?.reason ?? null, { observed: describeCall(call, nameOf) }));
  }
  if (run.ending !== 'none') checks.push(check('ending', true, null, { observed: run.ending === 'message' ? run.message ? (run.message.message.kind === 'template' ? 'send_whatsapp_template' : 'send_whatsapp_text') : 'message' : run.ending }));
  return checks;
}

export function gate(calls: ToolCall[], ctx: DecisionContext, live?: Parameters<typeof judgeRun>[2]): { decision: GatedAnswer; checks: GateCheck[]; run: JudgedRun } {
  const run = judgeRun(calls, ctx, live);
  const checks = checksOf(run, calls);
  if (run.refusals.length > 0) throw new DecisionRejectedError(run.refusals[0]!.reason, checks);
  const decision: GatedAnswer = {
    ...run.changes,
    decision: run.ending === 'message' ? 'follow_up' : run.ending,
    reasoning: run.reasoning,
    message: run.message?.message ?? null,
    send_at: run.message?.sendAt ?? null,
  };
  return { decision, checks, run };
}

/** The old `normalizeDecision(raw, ctx)`: the raw form through the calls and the judge. */
export function normalizeAnswer(raw: TestAnswer, ctx: DecisionContext, live?: Parameters<typeof judgeRun>[2]): GatedAnswer {
  return gate(callsOf(raw), ctx, live).decision;
}
