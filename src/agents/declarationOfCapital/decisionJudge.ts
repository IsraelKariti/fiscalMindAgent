import type { GateCheck } from '../shared/gateChecks.js';
import {
  changeCount,
  mergeChanges,
  normalizeChanges,
  normalizeFollowUpMessage,
  normalizeSendAt,
  validateDocumentFetch,
  validateTeamQuestion,
  type DecisionContext,
  type DocumentFetchDecision,
  type FollowUpMessage,
  type NormalizedChanges,
  type TeamQuestionDecision,
} from './decisionSchema.js';
import {
  assembleCalls,
  checklistUnits,
  inExecutionOrder,
  isChecklistTool,
  isTerminalTool,
  parseTurnCalls,
  toolsForContext,
  type DecisionTool,
  type ParsedToolCall,
  type ToolCall,
} from './decisionTools.js';

/**
 * The pure judging of planner calls (openspec `planner-answer-tools`, "Each
 * call is judged and executed on its own"), shared by plan.ts — which judges a
 * turn and applies what was accepted, reloading the context between turns —
 * and by the evals harness and the tests, which have no database and judge a
 * whole run's calls at once (`judgeRun`). Every judge returns the accepted
 * value or the refusal text the model is answered with.
 */

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 500);

/** The checklist tools that name one row: a turn may call each once per row. */
const SINGLE_TARGET_TOOLS: ReadonlySet<string> = new Set(['set_required', 'set_company', 'retire_document', 'state_cost', 'state_vehicle']);

/** What the run did before the call being judged — the cross-call rules read it. */
export interface RunJudgeState {
  /** A resolution, addition, retirement, company set or statement was already applied. */
  changesBefore: boolean;
  /** `ask_team` was already accepted in this run. */
  asked: boolean;
  /** A `document_fetch` was already accepted in this run. */
  fetchSet: boolean;
  /** A file was tied or a document collected in this run. */
  tied: boolean;
  /** An attestation request was already accepted in this run. */
  attestationRequested: boolean;
  /** The run already ended (the terminal tool's name), or null. */
  endedBy: string | null;
}

export function freshRunState(): RunJudgeState {
  return { changesBefore: false, asked: false, fetchSet: false, tied: false, attestationRequested: false, endedBy: null };
}

export type Judged<T> = { ok: true; value: T } | { ok: false; refusal: string };

const refused = (refusal: string): Judged<never> => ({ ok: false, refusal });

export interface JudgedUnits {
  accepted: { calls: ParsedToolCall[]; changes: NormalizedChanges }[];
  refused: { call: ParsedToolCall; reason: string }[];
  /** The accepted units' changes as one, in unit order. */
  merged: NormalizedChanges;
}

/**
 * The checklist calls of a turn as units (decisionTools.ts `checklistUnits`),
 * each assembled and judged by `normalizeChanges` against the context, the
 * attestation request last (it needs a run that changed nothing). A unit the
 * rules refuse answers every call of it with the refusal.
 */
export function judgeChecklistUnits(
  calls: readonly ParsedToolCall[],
  ctx: DecisionContext,
  state: { changesBefore: boolean },
  checks: GateCheck[] = [],
): JudgedUnits {
  const checklist = calls.filter((c) => isChecklistTool(c.name));
  const units = checklistUnits(checklist).sort(
    (a, b) => Number(a.some((c) => c.name === 'attestation')) - Number(b.some((c) => c.name === 'attestation')),
  );
  const accepted: JudgedUnits['accepted'] = [];
  const refusedCalls: JudgedUnits['refused'] = [];
  let changesBefore = state.changesBefore;
  // One call per target per turn for the single-target tools: the second call on the same row is refused by name.
  const targets = new Set<string>();
  for (const unit of units) {
    const head = unit[0]!;
    const targetId = typeof head.args.document_id === 'string' ? head.args.document_id.trim() : '';
    if (SINGLE_TARGET_TOOLS.has(head.name) && targetId !== '') {
      const key = `${head.name}:${targetId}`;
      if (targets.has(key)) {
        const reason = `${head.name} targets document ${targetId} twice in this turn — one call per row`;
        for (const call of unit) refusedCalls.push({ call, reason });
        continue;
      }
      targets.add(key);
    }
    try {
      const changes = normalizeChanges(assembleCalls(unit), ctx, { changesBefore }, checks);
      accepted.push({ calls: unit, changes });
      if (changeCount(changes) > 0) changesBefore = true;
    } catch (err) {
      const reason = messageOf(err);
      for (const call of unit) refusedCalls.push({ call, reason });
    }
  }
  return { accepted, refused: refusedCalls, merged: mergeChanges(accepted.map((a) => a.changes)) };
}

/** The `tie_file` / `mark_collected` calls of a turn: the pairs with validated evidence and the collected ids (never refused as a group). */
export function judgeTies(calls: readonly ParsedToolCall[], ctx: DecisionContext): NormalizedChanges {
  const ties = calls.filter((c) => c.name === 'tie_file' || c.name === 'mark_collected');
  return normalizeChanges(assembleCalls(ties), ctx, { changesBefore: true });
}

/** One `ask_team` call: once per run, before the ending, and the question rules (openspec `team-questions`). */
export function judgeAskTeam(call: ParsedToolCall, ctx: DecisionContext, state: RunJudgeState): Judged<TeamQuestionDecision> {
  if (state.endedBy) return refused(`the run already ended with ${state.endedBy} — ask_team comes before the message`);
  if (state.asked) return refused('ask_team was already called in this run — one question per run');
  try {
    const question = validateTeamQuestion(assembleCalls([call]), ctx);
    if (!question) return refused('ask_team: the question is empty — write the question for the team member, or drop the call');
    return { ok: true, value: question };
  } catch (err) {
    return refused(messageOf(err));
  }
}

/** One `document_fetch` call: once per run, a valid action for the provider's state (applied with the run's message). */
export function judgeDocumentFetch(call: ParsedToolCall, ctx: DecisionContext, state: RunJudgeState): Judged<DocumentFetchDecision> {
  if (state.endedBy) return refused(`the run already ended with ${state.endedBy} — nothing runs after the ending`);
  if (state.fetchSet) return refused('document_fetch was already set in this run — one fetch step per run');
  try {
    const decision = validateDocumentFetch(assembleCalls([call]), ctx);
    if (!decision) return refused('document_fetch: no action given');
    return { ok: true, value: decision };
  } catch (err) {
    return refused(messageOf(err));
  }
}

/** The one message of a run, as the terminal call carries it: the window and template rules, the send time. */
export function judgeMessage(call: ParsedToolCall, ctx: DecisionContext, state: RunJudgeState): Judged<{ message: FollowUpMessage; sendAt: string; reasoning: string }> {
  if (state.endedBy) return refused(`the run already ended with ${state.endedBy} — one ending per run`);
  try {
    const message = normalizeFollowUpMessage(
      call.name === 'send_whatsapp_text'
        ? { whatsapp_text: String(call.args.text ?? ''), whatsapp_template: null }
        : { whatsapp_text: null, whatsapp_template: { template_id: String(call.args.template_id ?? ''), variables: Array.isArray(call.args.variables) ? call.args.variables.map(String) : [] } },
      ctx,
    );
    const sendAt = normalizeSendAt(typeof call.args.send_at === 'string' ? call.args.send_at : null);
    if (!sendAt) {
      return refused(`send_at "${String(call.args.send_at ?? '')}" is not valid — give "YYYY-MM-DD HH:MM" in the accountant's timezone, or "asap" for a client who is waiting now`);
    }
    return { ok: true, value: { message, sendAt, reasoning: String(call.args.reasoning ?? '') } };
  } catch (err) {
    return refused(messageOf(err));
  }
}

/** `client_declined` is the whole run (openspec `client-decline`): refused when the run already did anything else. */
export function judgeDecline(call: ParsedToolCall, state: RunJudgeState): Judged<{ reasoning: string }> {
  if (state.endedBy) return refused(`the run already ended with ${state.endedBy} — one ending per run`);
  const done = [
    ...(state.tied ? ['a file tie'] : []),
    ...(state.changesBefore ? ['a checklist change'] : []),
    ...(state.asked ? ['a team question'] : []),
    ...(state.fetchSet ? ['a document_fetch step'] : []),
    ...(state.attestationRequested ? ['an attestation request'] : []),
  ];
  if (done.length > 0) return refused(`client_declined is the whole run — this run already made ${done.join(', ')}; end it with a message instead`);
  return { ok: true, value: { reasoning: String(call.args.reasoning ?? '') } };
}

/** `goal_complete`: every row settled and the attestation confirmed, on the live state the caller supplies. */
export function judgeGoalComplete(
  call: ParsedToolCall,
  live: { hasDocuments: boolean; allSettled: boolean; attestationConfirmed: boolean },
  state: RunJudgeState,
): Judged<{ reasoning: string }> {
  if (state.endedBy) return refused(`the run already ended with ${state.endedBy} — one ending per run`);
  if (live.hasDocuments && !(live.allSettled && live.attestationConfirmed)) {
    const why = live.allSettled
      ? "the attestation is not confirmed — send the summary (attestation request) or wait for the client's confirmation"
      : 'documents are still unsettled (pending, collected or claimed rows remain)';
    return refused(`goal_complete refused: ${why}`);
  }
  return { ok: true, value: { reasoning: String(call.args.reasoning ?? '') } };
}

// ---------------------------------------------------------------------------
// A whole run at once (the evals harness, the tests)

/** How a judged run ended. */
export type RunEndingKind = 'message' | 'goal_complete' | 'client_declined' | 'none';

export interface JudgedRun {
  /** Every call that passed the shape check, in execution order. */
  accepted: ParsedToolCall[];
  /** Every refusal, shape faults included, in execution order. */
  refusals: { call: ToolCall; reason: string }[];
  /** The checks the validators reported (stated cost, company, vehicle). */
  checks: GateCheck[];
  /** The checklist changes and ties of the whole run, merged. */
  changes: NormalizedChanges;
  teamQuestion: TeamQuestionDecision | null;
  documentFetch: DocumentFetchDecision | null;
  ending: RunEndingKind;
  /** The accepted message, when the run ended with one. */
  message: { message: FollowUpMessage; sendAt: string; reasoning: string } | null;
  /** The reasoning of the terminal call, '' when none. */
  reasoning: string;
}

/**
 * Judges the calls of a whole run as one turn, with no database: the shape
 * check, the checklist units, the ties, the team question, the fetch step and
 * the terminal calls in the fixed order, a simulated run state in between. The
 * goal state (`live`) is what the caller knows of the checklist. Nothing is
 * applied; this is what the evals harness and the tests judge.
 */
export function judgeRun(
  calls: readonly ToolCall[],
  ctx: DecisionContext,
  live: { hasDocuments: boolean; allSettled: boolean; attestationConfirmed: boolean } = { hasDocuments: true, allSettled: ctx.intake?.allSettled ?? false, attestationConfirmed: ctx.intake?.attestationConfirmed ?? false },
  tools: readonly DecisionTool[] = toolsForContext(ctx),
): JudgedRun {
  const { accepted, faults } = parseTurnCalls(calls, tools);
  const ordered = inExecutionOrder(accepted);
  const refusals: JudgedRun['refusals'] = faults.map((f) => ({ call: f.call, reason: f.reason }));
  const checks: GateCheck[] = [];
  const state = freshRunState();
  const units = judgeChecklistUnits(ordered, ctx, state, checks);
  for (const r of units.refused) refusals.push({ call: r.call, reason: r.reason });
  if (changeCount(units.merged) > 0) state.changesBefore = true;
  if (units.merged.attestation?.action === 'request') state.attestationRequested = true;
  let changes = units.merged;
  const ties = judgeTies(ordered, ctx);
  const tied =
    ties.matched_files.length > 0 ||
    ties.collected_document_ids.length > 0 ||
    [...changes.resolutions.flatMap((r) => (r.resolution === 'required' ? r.instances : [])), ...changes.addedInstances.flatMap((a) => a.instances)].some((i) => i.fileIds.length > 0);
  if (tied) state.tied = true;
  changes = { ...changes, matched_files: ties.matched_files, collected_document_ids: ties.collected_document_ids };
  let teamQuestion: TeamQuestionDecision | null = null;
  let documentFetch: DocumentFetchDecision | null = null;
  let ending: RunEndingKind = 'none';
  let message: JudgedRun['message'] = null;
  let reasoning = '';
  for (const call of ordered) {
    if (call.name === 'ask_team') {
      const j = judgeAskTeam(call, ctx, state);
      if (j.ok) {
        teamQuestion = j.value;
        state.asked = true;
      } else refusals.push({ call, reason: j.refusal });
    } else if (call.name === 'document_fetch') {
      const j = judgeDocumentFetch(call, ctx, state);
      if (j.ok) {
        documentFetch = j.value;
        state.fetchSet = true;
      } else refusals.push({ call, reason: j.refusal });
    } else if (isTerminalTool(call.name)) {
      if (call.name === 'send_whatsapp_text' || call.name === 'send_whatsapp_template') {
        const j = judgeMessage(call, ctx, state);
        if (j.ok) {
          message = j.value;
          reasoning = j.value.reasoning;
          ending = 'message';
          state.endedBy = call.name;
        } else refusals.push({ call, reason: j.refusal });
      } else if (call.name === 'goal_complete') {
        const j = judgeGoalComplete(call, live, state);
        if (j.ok) {
          reasoning = j.value.reasoning;
          ending = 'goal_complete';
          state.endedBy = call.name;
        } else refusals.push({ call, reason: j.refusal });
      } else {
        const j = judgeDecline(call, state);
        if (j.ok) {
          reasoning = j.value.reasoning;
          ending = 'client_declined';
          state.endedBy = call.name;
        } else refusals.push({ call, reason: j.refusal });
      }
    }
  }
  return { accepted: ordered, refusals, checks, changes: { ...changes, document_fetch: documentFetch, teamQuestion }, teamQuestion, documentFetch, ending, message, reasoning };
}
