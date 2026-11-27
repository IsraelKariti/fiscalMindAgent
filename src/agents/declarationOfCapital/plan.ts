import * as llmUsage from '../../db/queries/llmUsage.js';
import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as emails from '../../db/queries/emails.js';
import * as auditEvents from '../../db/queries/auditEvents.js';
import * as waSenders from '../../db/queries/waSenders.js';
import * as waTemplates from '../../db/queries/waTemplates.js';
import * as users from '../../db/queries/users.js';
import * as teamQuestions from '../../db/queries/teamQuestions.js';
import { sendWhatsAppTextAndRecord } from '../../twilio/sendAndRecord.js';
import { closingMessageDelivery } from './closingMessage.js';
import { buildPrompt, type VerificationResultPromptInput, type WaChannelState } from './prompt.js';
import { sendClaimedDocumentsEmail, sendGoalCompleteEmail, sendTeamQuestionEmail } from './notifyAccountant.js';
import { teamQuestionAddressee } from './teamQuestions.js';
import { applicableFilePairs, fileMatchesDocument, isQuarantined, isVerifiedLegibleFile } from '../shared/fileEvidence.js';
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { lastInboundMessageAt, resolveSendAt, rollBlockedSendAt } from '../shared/sendAtGuard.js';
import { syncMondayDocumentsStatus } from '../shared/mondayStatusSync.js';
import { capitalClientTaxYear } from '../shared/taxYear.js';
import { getCatalogType } from './catalog.js';
import { approvedPropertyFilesOf, provenFactsLine, provenFactsOf } from './provenFacts.js';
import { selfEvidentFilesOf } from './selfEvidentFiles.js';
import { readSpouse } from './spouseIdentity.js';
import { mergeVehicleEvidence, vehicleEvidenceOf } from './vehicleDeclaration.js';
import { replacementOfRetirement } from './retirementReplacement.js';
import { verifyBatch } from './verifyDocument.js';
import type { VerificationResult } from './verifyBatchRules.js';
import { childDisplayName } from './splitChildNames.js';
import { assignFilesToNewRows, filterPairsByCompany, type NewRowFiles } from './fileTies.js';
import { planCompanySplit } from './companySplit.js';
import { lostFilesByMessage } from './lostFiles.js';
import {
  addInstanceDetail,
  askTeamDetail,
  attestationDetail,
  attributeCollectionOutcome,
  concludeDetail,
  refusedDetail,
  resolveDocumentDetail,
  retireDocumentDetail,
  setCompanyDetail,
  sendMessageDetail,
  stateCostDetail,
  stateVehicleDetail,
  documentFetchDetail,
  tieResultText,
  toolResultText,
  type CompanySplitDetail,
  type RunEnding,
  type TieVerdict,
} from './toolStepDetails.js';
import { check, type GateCheck } from '../shared/gateChecks.js';
import type { ExecuteOutcome } from '../../gemini/toolLoop.js';
import { vehicleFactsLine } from './vehicleDeclaration.js';
import { DECLARATION_OF_CAPITAL } from './agentType.js';
import { decide, type DecideResult } from './decide.js';
import { describeCall, describeCalls, inExecutionOrder, isChecklistTool, isTerminalTool, parseTurnCalls, toolsForContext, type ParsedToolCall, type ToolCall } from './decisionTools.js';
import { judgeAskTeam, judgeChecklistUnits, judgeDecline, judgeDocumentFetch, judgeGoalComplete, judgeMessage, judgeTies, type RunJudgeState } from './decisionJudge.js';
import {
  allowedDocumentFetchActions,
  type DecisionContext,
  type DocumentFetchDecision,
  type FollowUpMessage,
  type IntakeDecisionState,
  type NormalizedChanges,
  type StatedCost,
  type StatedVehicle,
  type TeamQuestionDecision,
} from './decisionSchema.js';
import { applyDocumentFetchAction, loadDocumentFetchContexts, pendingKeys, sitesForUnnamedRows, type DocumentFetchContext } from './documentFetch/flow.js';
import { getProviderSpec } from './documentFetch/providers.js';
import { clientIdNumber } from './documentFetch/clientId.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { recordAudit, type AuditAction } from '../../audit/audit.js';
import { scheduleDraftMessage } from '../../orchestration/scheduleDraftEmail.js';
import { windowCloseTime } from '../../orchestration/whatsappWindow.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { ClientDocumentRow, ClientRow, DocumentFileRow, EmailRow, TeamQuestionRow } from '../../db/types.js';
import { splitTemplatesByPurpose } from './templatePurpose.js';
import { handleClientDecline } from './clientDecline.js';

/** Covers a realistic burst of client messages; older drafts add nothing the documents list doesn't already show. */
const MAX_UNSENT_DRAFTS = 5;

/**
 * What the agent may do on WhatsApp right now: the client must be opted in
 * with a valid number, the accountant must have a sender, and there must be
 * something sendable (an open 24h window for free-form text, or at least one
 * approved template usable for this client).
 */
export async function getWaChannelState(client: ClientRow, now: Date, agentType: string): Promise<WaChannelState> {
  if (!client.wa_enabled || !client.wa_phone) {
    return {
      allowed: false,
      unavailableReason: 'the client has not opted in to WhatsApp',
      windowOpen: false,
      windowClosesAt: null,
      templates: [],
      hiddenTemplates: [],
    };
  }
  const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
  if (!sender) {
    return {
      allowed: false,
      unavailableReason: 'no WhatsApp sender number is assigned to this agent',
      windowOpen: false,
      windowClosesAt: null,
      templates: [],
      hiddenTemplates: [],
    };
  }
  const [lastInboundAt, firstContactDone, allTemplates] = await Promise.all([
    emails.lastInboundWhatsAppAt(client.id),
    emails.hasDeliveredOutbound(client.id),
    waTemplates.listForAgentType(agentType),
  ]);
  const windowClosesAt = windowCloseTime(lastInboundAt);
  const windowOpen = windowClosesAt !== null && now < windowClosesAt;
  const { templates, hiddenTemplates } = splitTemplatesByPurpose(allTemplates, firstContactDone);
  if (!windowOpen && templates.length === 0) {
    const missing = firstContactDone ? 'reopen' : 'intro';
    return {
      allowed: false,
      unavailableReason: `the 24h window is closed and no '${missing}' template is registered for this agent type`,
      windowOpen: false,
      windowClosesAt: null,
      templates: [],
      hiddenTemplates,
    };
  }
  return { allowed: true, unavailableReason: null, windowOpen, windowClosesAt, templates, hiddenTemplates };
}


/** How the run ended, as the terminal executors record it (openspec `planner-answer-tools`, "A run ends with exactly one ending"). */
interface RunEnded {
  kind: 'message' | 'goal_complete' | 'client_declined';
  call: ParsedToolCall;
  emailId?: string;
  sendAt?: string;
}

/** What the run did so far — the cross-call rules read it (a decline after a tie, a second ask, the attestation request after a change). */
interface RunState {
  ended: RunEnded | null;
  /** `ask_team` was accepted in this run. */
  asked: boolean;
  /** A file was tied or a document collected in this run. */
  tied: boolean;
  /** A resolution, addition, retirement, company set or statement was applied in this run. */
  changed: boolean;
  /** An accepted `attestation(request)`: this run's message is the summary (applied with the message). */
  pendingAttestationRequest: ParsedToolCall | null;
  /** An accepted `document_fetch`: applied with the message (or with the goal completion). */
  pendingFetch: { call: ParsedToolCall; decision: DocumentFetchDecision } | null;
}

/** The run state as the pure judges read it (decisionJudge.ts). */
function judgeStateOf(state: RunState): RunJudgeState {
  return {
    changesBefore: state.changed,
    asked: state.asked,
    fetchSet: state.pendingFetch !== null,
    tied: state.tied,
    attestationRequested: state.pendingAttestationRequest !== null,
    endedBy: state.ended?.call.name ?? null,
  };
}

/** A tool step buffered until the turn's verification ends, so the tie steps carry their verdict. */
interface PendingStep {
  call: ParsedToolCall;
  detail: Record<string, unknown>;
  target?: { type: string; id: string };
}

/**
 * One planner run in progress: what every step below shares. `documents`,
 * `files`, `intake` and `attestationConfirmed` are reloaded or changed by
 * the executors between turns; `history` and `waState` are the snapshot the
 * run started from. `calls` and the `turn*` fields are the current turn's.
 */
interface PlanRun {
  ctx: AgentContext;
  client: ClientRow;
  clientId: string;
  now: Date;
  agentType: string;
  /** The declaration year is per client (from the monday board row) — the instance has no year. */
  taxYear: number;
  /** Delivered messages only: every rule reads what the client saw. */
  history: EmailRow[];
  documents: ClientDocumentRow[];
  files: DocumentFileRow[];
  fileById: Map<string, DocumentFileRow>;
  waState: WaChannelState;
  documentFetchContexts: DocumentFetchContext[];
  intake: IntakeDecisionState;
  attestationConfirmed: boolean;
  /** The questions the agent asked the client's team, newest first (openspec `team-questions`): the prompt section and the one-open-question gate. */
  teamQuestions: TeamQuestionRow[];
  state: RunState;
  /** The accepted calls of the current turn, in execution order: each is executed and recorded as its own step (openspec `conversation-trace`). */
  calls: ParsedToolCall[];
  /** The result text each call of the current turn is answered with. */
  turnResults: Map<ParsedToolCall, string>;
  /** The step detail written for each call of the current turn (the tie verdict is appended to it). */
  turnDetails: Map<ParsedToolCall, Record<string, unknown>>;
  /** The checklist changes of the current turn (the rows it created, with the files named for them). */
  turnChanges: ChecklistChanges;
  /** A tie or collection landed in the current turn: a message of the same turn was written before the verdict. */
  turnHadTies: boolean;
  /** While set, tool steps are buffered (PendingStep) instead of written — flushed with the verdicts after verification. */
  deferSteps: boolean;
  pendingSteps: PendingStep[];
}

/** A row this turn created, with the `add_instance` call it came from (anchor + instance name) so its step can be written once the files are assigned. */
interface CreatedRow extends NewRowFiles {
  /** The full row as inserted (apply_retirements reads its paper). */
  row: ClientDocumentRow;
  anchorId: string;
  instanceName: string;
}

/** What the apply steps changed on the checklist in one turn. */
interface ChecklistChanges {
  /** How many decision items changed state (one per resolution, addition or retirement that landed). */
  applied: number;
  /** Rows created in this turn on the client's quoted words, with the waiting files the model named for them (openspec `unlisted-files`). */
  createdWithFiles: CreatedRow[];
  /** Rows born 'claimed' (the client says the office already holds the document): the accountant is told once. */
  claimedAtCreation: string[];
  /** Rows created in this turn whose instance carried a cost the client stated in the chat (openspec `chat-stated-cost`): closed by apply_stated_costs. */
  createdStated: { row: ClientDocumentRow; cost: StatedCost }[];
  /** Rows created in this turn whose instance carried vehicle facts the client stated in the chat (openspec `vehicle-declaration`): filled by apply_vehicle_declarations. */
  createdStatedVehicles: { row: ClientDocumentRow; statement: StatedVehicle }[];
}

function emptyChecklistChanges(): ChecklistChanges {
  return { applied: 0, createdWithFiles: [], claimedAtCreation: [], createdStated: [], createdStatedVehicles: [] };
}

/** What the collect step decided and did: the input of the verification targets and of the tie_file / mark_collected steps. */
interface CollectionOutcome {
  newlyCollected: string[];
  newlyClaimed: string[];
  proposedCollected: string[];
  proposedPairs: { file_id: string; document_id: string }[];
  refusedTies: ReturnType<typeof assignFilesToNewRows>['refused'];
  splitDetail: CompanySplitDetail;
  /** Items the split renamed or created: their verification file is this turn's pair, never a stale strong match. */
  splitTouched: Set<string>;
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 500);

/**
 * One planner run (openspec `planner-answer-tools`): the model calls tools in a
 * loop; every turn's calls are judged and executed here (executeTurn) and
 * answered with their results — a tie with its verification verdict — until an
 * accepted terminal call ends the run: a message (scheduled), goal_complete or
 * client_declined. The trail reads, per turn, validate_message → one step per
 * call (set_required, add_instance, …, tie_file, mark_collected, ask_team,
 * send_whatsapp_* / goal_complete / client_declined) → and at the end the
 * code-written conclude step (openspec `conversation-trace`). A run without
 * an ending (two turns without a call, or the turn cap) fails loudly; what it
 * applied stands.
 */
export async function planFollowUp(ctx: AgentContext): Promise<void> {
  const run = await loadPlanningContext(ctx);
  const result = await askPlanner(run);
  const ended = run.state.ended;
  if (result.ended === 'terminal' && ended) {
    recordConclude(run, runEndingOf(ended, result.turns));
    return;
  }
  // No ending (openspec `planner-answer-tools`, "A run ends with exactly one ending"): the gate row of the last turn says so, the conclude step records the failure.
  const why = result.ended === 'cap' ? 'cap' : 'no_ending';
  const note =
    why === 'cap'
      ? `the run made ${result.turns} turns without an accepted terminal call (the turn cap)`
      : 'two turns without a tool call: the run has no ending (no message, no goal_complete, no client_declined)';
  recordGateRow(run, result.turns, false, [check('ending', false, note, { observed: describeCalls(result.calls) })]);
  if (run.state.pendingFetch) {
    const { call, decision } = run.state.pendingFetch;
    recordToolStep(run, call, { ...documentFetchDetail(call, { applied: false, provider: decision.provider, documentKeys: decision.documentKeys, emailId: null }), reason: 'not applied: the run ended without a message' });
  }
  recordConclude(run, { kind: 'failed', why, turns: result.turns });
  throw new Error(`planFollowUp: the planner run ended without an ending (${result.ended}) for client ${run.clientId} after ${result.turns} turns`);
}

/** The code-written conclude step's input, from the terminal call that ended the run. */
function runEndingOf(ended: RunEnded, turns: number): RunEnding {
  const reasoning = typeof ended.call.args.reasoning === 'string' ? ended.call.args.reasoning : '';
  if (ended.kind === 'message') return { kind: 'message', emailId: ended.emailId ?? '', sendAt: ended.sendAt ?? '', reasoning, turns };
  return { kind: ended.kind, reasoning, turns };
}

/**
 * One turn of the loop (openspec `planner-answer-tools`, "Each call is judged
 * and executed on its own"): the `tool_calls` check per call, then the calls
 * in the fixed safe order — the checklist units, the ties (verified at once),
 * the team question, the fetch action, the terminal call — each judged against
 * the live context and answered with its result; a refused call is answered
 * with the refusal and the turn goes on. One `validate_message` row per turn.
 */
async function executeTurn(run: PlanRun, rawCalls: readonly ToolCall[], turn: number): Promise<ExecuteOutcome> {
  const ctx = buildDecisionContext(run);
  const { accepted, faults } = parseTurnCalls(rawCalls, toolsForContext(ctx));
  const results = new Map<number, string>();
  const checks: GateCheck[] = [
    check('tool_calls', faults.length === 0, faults.length > 0 ? faults.map((f) => f.reason).join(' · ').slice(0, 500) : null, { observed: describeCalls(rawCalls) }),
  ];
  run.calls = inExecutionOrder(accepted);
  run.turnResults = new Map();
  run.turnDetails = new Map();
  run.turnChanges = emptyChecklistChanges();
  run.turnHadTies = false;
  for (const f of faults) {
    results.set(f.index, `refused: ${f.reason}`);
    // A known tool with bad arguments still gets its step; an unknown tool has no step name.
    if (f.tool) recordRefusedStep(run, { name: f.tool, args: asRecord(f.call.args), index: f.index, turn }, f.reason);
  }
  if (run.state.ended) {
    for (const call of run.calls) refuseCall(run, call, `the run already ended with ${run.state.ended.call.name} — nothing runs after the ending`);
  } else {
    await runChecklistUnits(run, ctx, checks);
    await runTies(run, ctx);
    await runAskTeam(run, ctx);
    runDocumentFetch(run, ctx);
    await runTerminals(run, ctx);
  }
  const nameOf = (id: string) => docName(run, id) ?? fileName(run, id);
  let refused = faults.length > 0;
  for (const call of run.calls) {
    const result = run.turnResults.get(call) ?? 'done';
    const isRefused = result.startsWith('refused: ');
    refused ||= isRefused;
    checks.push(check('business_rules', !isRefused, isRefused ? result.slice('refused: '.length) : null, { observed: describeCall(call, nameOf) }));
    results.set(call.index ?? -1, result);
  }
  const ended = run.state.ended !== null;
  if (ended) checks.push(check('ending', true, null, { observed: run.state.ended!.call.name }));
  recordGateRow(run, turn, !refused, checks);
  return {
    results: rawCalls.map((c, i) => ({ ...(c.id !== undefined ? { id: c.id } : {}), name: c.name, output: results.get(i) ?? 'done' })),
    ended,
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/** The `validate_message` row of one turn (openspec `code-gates`): the turn, the overall result and the checks in order. */
function recordGateRow(run: PlanRun, turn: number, result: boolean, checks: GateCheck[]): void {
  recordAudit({
    actorType: 'system',
    action: 'validate_message',
    agentInstanceId: run.client.agent_instance_id,
    clientId: run.clientId,
    severity: result ? undefined : 'warning',
    detail: { clientName: run.client.name, turn, result, ...(run.state.ended ? { decision: run.state.ended.kind } : {}), checks },
  });
}

/** A call the rules refused: its step and its result say why; the turn goes on. */
function refuseCall(run: PlanRun, call: ParsedToolCall, reason: string): void {
  recordRefusedStep(run, call, reason);
}

function recordRefusedStep(run: PlanRun, call: ParsedToolCall, reason: string): void {
  const detail = refusedDetail(call, reason, (id) => docName(run, id) ?? fileName(run, id));
  recordToolStep(run, call, detail);
}

/**
 * The checklist calls of the turn, as units (decisionTools.ts `checklistUnits`):
 * each unit assembled and judged on its own (normalizeChanges) against the live
 * context, the accepted units merged and applied together in the fixed order
 * (resolutions, companies, additions, retirements, stated costs, vehicle
 * facts, the attestation confirmation). A unit the rules refuse answers every
 * call of it with the refusal and changes nothing. An attestation request is
 * judged last (it needs a run that changed nothing) and rides on the message.
 */
async function runChecklistUnits(run: PlanRun, ctx: DecisionContext, checks: GateCheck[]): Promise<void> {
  if (!run.calls.some((c) => isChecklistTool(c.name))) return;
  const judged = judgeChecklistUnits(run.calls, ctx, { changesBefore: run.state.changed }, checks);
  for (const { call, reason } of judged.refused) refuseCall(run, call, reason);
  const merged = judged.merged;
  const changes = run.turnChanges;
  await applyResolutions(run, merged, changes);
  await applyCompanies(run, merged, changes);
  await applyAdditions(run, merged, changes);
  await applyRetirements(run, merged, changes);
  await applyStatedCosts(run, merged, changes);
  await applyVehicleDeclarations(run, merged, changes);
  await settleChecklistChanges(run, changes);
  await applyAttestationConfirmed(run, merged);
  if (changes.applied > 0) run.state.changed = true;
  if (merged.attestation?.action === 'request') {
    const call = run.calls.find((c) => c.name === 'attestation' && c.args.action === 'request');
    if (call) {
      run.state.pendingAttestationRequest = call;
      recordToolStep(run, call, { ...attestationDetail(call, { applied: true }), reason: "noted: this run's message is the attestation summary (stamped when it is scheduled)" });
    }
  }
}

/**
 * The ties of the turn (openspec `planner-answer-tools`, "A file tie is
 * verified before the model continues"): the `tie_file` / `mark_collected`
 * calls and the rows this turn created with files, through the collect step
 * as one group (split, company check, collect-or-claim, links), then the
 * verification of the collected documents as one batch — processing stamp on,
 * drafting stamp back — and the verdict appended to each call's step and
 * result. The snapshot (documents, files, intake) is reloaded for the next turn.
 */
async function runTies(run: PlanRun, ctx: DecisionContext): Promise<void> {
  const { client, clientId } = run;
  const tieCalls = run.calls.filter((c) => c.name === 'tie_file' || c.name === 'mark_collected');
  const createdWithFiles = run.turnChanges.createdWithFiles.some((c) => c.fileIds.length > 0);
  if (tieCalls.length === 0 && !createdWithFiles) return;
  const changes = judgeTies(tieCalls, ctx);
  run.deferSteps = true;
  run.pendingSteps = [];
  let outcome: CollectionOutcome;
  try {
    outcome = await collectFiles(run, changes, run.turnChanges);
  } finally {
    run.deferSteps = false;
  }
  const tied = outcome.newlyCollected.length > 0 || outcome.newlyClaimed.length > 0 || outcome.proposedPairs.length > 0;
  run.turnHadTies ||= tied;
  if (tied) run.state.tied = true;
  const targets = pickVerificationTargets(run, outcome);
  let results: VerificationResult[] = [];
  if (targets.length > 0) {
    logger.info('verifying the documents tied in this turn', { clientId, targets });
    results = await verifyBatch(client, run.ctx.instance, targets);
    // Back from "processing" to "drafting" for the model's next turn (openspec `turn-activity-states`).
    await clients.markDraftingStarted(clientId);
  }
  await reloadSnapshot(run);
  const verdictOf = (documentId: string | undefined): TieVerdict | null => {
    if (!documentId) return null;
    const result = results.find((r) => r.documentId === documentId);
    const doc = run.documents.find((d) => d.id === documentId);
    const record = (doc?.verification ?? null) as { reasons?: unknown; checks?: unknown } | null;
    const reasons = Array.isArray(record?.reasons) ? record!.reasons.filter((x): x is string => typeof x === 'string') : [];
    if (!result) {
      if (doc?.status === 'claimed' && outcome.newlyClaimed.includes(documentId)) return { outcome: 'claimed', reasons: [], facts: [] };
      return null;
    }
    const facts =
      result.outcome === 'approved' && Array.isArray(record?.checks)
        ? (record!.checks as { key?: unknown; observed?: unknown }[])
            .filter((c) => (c.key === 'as_of_date' || c.key === 'type_fields') && typeof c.observed === 'string' && c.observed !== '')
            .map((c) => (c.key === 'as_of_date' ? `as of ${c.observed as string}` : (c.observed as string)))
        : [];
    return { outcome: result.outcome, reasons, facts };
  };
  for (const step of run.pendingSteps) {
    const documentId = typeof step.detail.endedUnderId === 'string' ? step.detail.endedUnderId : typeof step.detail.documentId === 'string' ? step.detail.documentId : undefined;
    const verdict = verdictOf(documentId);
    const result = tieResultText(step.detail, verdict);
    const detail = { ...step.detail, ...(verdict && verdict.outcome !== 'none' ? { verdict: verdict.outcome, ...(verdict.reasons.length > 0 ? { verdictReasons: verdict.reasons } : {}) } : {}), result };
    run.turnResults.set(step.call, result);
    run.turnDetails.set(step.call, detail);
    writeStep(run, step.call, detail, step.target);
  }
  run.pendingSteps = [];
}

/** The snapshot the next turn's rules and prompt read: documents, files and the intake state, after this turn's changes. */
async function reloadSnapshot(run: PlanRun): Promise<void> {
  const { client, clientId } = run;
  run.documents = await clientDocuments.listForClient(clientId);
  run.files = await documentFiles.listForClient(clientId);
  run.fileById = new Map(run.files.map((f) => [f.id, f]));
  const { intake, attestationConfirmed } = await buildIntakeState(client, run.history, run.documents, run.files);
  run.intake = intake;
  run.attestationConfirmed = attestationConfirmed || run.attestationConfirmed;
}

/** The `ask_team` call of the turn: once per run, before the message, never while a question is open (openspec `team-questions`). */
async function runAskTeam(run: PlanRun, ctx: DecisionContext): Promise<void> {
  for (const call of run.calls.filter((c) => c.name === 'ask_team')) {
    const judged = judgeAskTeam(call, ctx, judgeStateOf(run.state));
    if (!judged.ok) {
      refuseCall(run, call, judged.refusal);
      continue;
    }
    await applyAskTeam(run, judged.value, call);
  }
}

/** The `document_fetch` call of the turn: judged now, applied with this run's message (or the goal completion). */
function runDocumentFetch(run: PlanRun, ctx: DecisionContext): void {
  for (const call of run.calls.filter((c) => c.name === 'document_fetch')) {
    const judged = judgeDocumentFetch(call, ctx, judgeStateOf(run.state));
    if (!judged.ok) {
      refuseCall(run, call, judged.refusal);
      continue;
    }
    run.state.pendingFetch = { call, decision: judged.value };
    run.turnResults.set(call, `noted: ${judged.value.action} on ${judged.value.provider} — applied together with this run's message`);
  }
}

/**
 * The terminal calls of the turn, in order: the first accepted one ends the run
 * (a message scheduled, the goal completed, the client declined); every later
 * call is refused. A message is judged by the window and template rules and
 * its send time; goal_complete by the live checklist and attestation;
 * client_declined by the run having done nothing else.
 */
async function runTerminals(run: PlanRun, ctx: DecisionContext): Promise<void> {
  for (const call of run.calls.filter((c) => isTerminalTool(c.name))) {
    const state = judgeStateOf(run.state);
    if (call.name === 'send_whatsapp_text' || call.name === 'send_whatsapp_template') {
      const judged = judgeMessage(call, ctx, state);
      if (!judged.ok) {
        refuseCall(run, call, judged.refusal);
        continue;
      }
      try {
        await scheduleReply(run, { ...judged.value, call });
      } catch (err) {
        refuseCall(run, call, messageOf(err));
      }
    } else if (call.name === 'goal_complete') {
      await completeGoal(run, call);
    } else if (call.name === 'client_declined') {
      await declineRun(run, call);
    }
  }
}

/**
 * `client_declined` (openspec `client-decline`): the client refused the
 * collection in words — the whole run is this one call. Refused when the run
 * already tied a file, changed the checklist, asked the team or set a fetch
 * step; otherwise the decline routine answers, pauses and emails.
 */
async function declineRun(run: PlanRun, call: ParsedToolCall): Promise<void> {
  const judged = judgeDecline(call, judgeStateOf(run.state));
  if (!judged.ok) {
    refuseCall(run, call, judged.refusal);
    return;
  }
  run.state.ended = { kind: 'client_declined', call };
  recordToolStep(run, call, { tool: call.name, ...(call.turn !== undefined ? { turn: call.turn } : {}), reasoning: judged.value.reasoning, applied: true, reason: 'the client declined: the decline routine answers and pauses' });
  await handleClientDecline(run.ctx, 'planner');
}

/**
 * `ask_team` (openspec `team-questions`): store the question for the client's
 * team member, record the step, and email the addressee — before the holding
 * message to the client is scheduled, so a crash in between leaves a question
 * the team can see rather than a promise nobody received. The email is fire
 * and forget: a failed send leaves the question open and answerable in the
 * app. A client whose owner has no email at all (legacy rows) cannot ask: the
 * step records why and the cycle goes on with the message.
 */
async function applyAskTeam(run: PlanRun, ask: TeamQuestionDecision, call: ParsedToolCall): Promise<void> {
  const { client, clientId } = run;
  const to = teamQuestionAddressee(client, run.ctx.accountant);
  if (!to || !client.agent_instance_id) {
    recordToolStep(run, call, askTeamDetail(call, { questionId: null, toName: '', toEmail: '', toMatch: 'accountant', applied: false, reason: 'no addressee: the client has no owner with an email' }));
    logger.warn('ask_team skipped: no addressee', { clientId });
    return;
  }
  const row = await teamQuestions.insert({
    clientId,
    agentInstanceId: client.agent_instance_id,
    question: ask.question,
    reason: ask.reason,
    evidenceMessageId: ask.evidenceMessageId,
    toEmail: to.email,
    toName: to.name,
    toMatch: to.match,
  });
  run.teamQuestions = [row, ...run.teamQuestions];
  recordToolStep(run, call, askTeamDetail(call, { questionId: row.id, toName: to.name, toEmail: to.email, toMatch: to.match, applied: true }), {
    type: 'team_question',
    id: row.id,
  });
  run.state.asked = true;
  logger.info('team question asked', { clientId, questionId: row.id, to: to.email, match: to.match });
  publishClientUpdated(clientId);
  void sendTeamQuestionEmail(client, row).catch((err) => logger.error('team question email failed', err, { clientId, questionId: row.id }));
}

/** One code-only step row of this cycle (send_closing, …). Never written for a no-op. */
function recordPlannerStep(run: PlanRun, action: AuditAction, detail: Record<string, unknown>): void {
  recordAudit({
    actorType: 'system',
    action,
    agentInstanceId: run.client.agent_instance_id,
    clientId: run.clientId,
    detail: { clientName: run.client.name, ...detail },
  });
}

/**
 * One tool-call step (openspec `conversation-trace`): the row is named after
 * the tool, carries the call's parameters with names next to ids, the outcome
 * of the execution (`reason` = the short outcome line of the trace row) and
 * the result text the model is answered with (`result`, from the outcome
 * line unless the detail carries its own). Written once per call of the
 * turn, right after the call ran — or buffered while the turn's ties are
 * being verified, so their steps carry the verdict.
 */
function recordToolStep(run: PlanRun, call: ParsedToolCall, detail: Record<string, unknown>, target?: { type: string; id: string }): void {
  const result = typeof detail.result === 'string' && detail.result !== '' ? detail.result : toolResultText(call, detail);
  const full = { ...detail, result };
  run.turnResults.set(call, result);
  run.turnDetails.set(call, full);
  if (run.deferSteps) {
    run.pendingSteps.push({ call, detail: full, ...(target ? { target } : {}) });
    return;
  }
  writeStep(run, call, full, target);
}

function writeStep(run: PlanRun, call: ParsedToolCall, detail: Record<string, unknown>, target?: { type: string; id: string }): void {
  recordAudit({
    actorType: 'system',
    action: call.name,
    agentInstanceId: run.client.agent_instance_id,
    clientId: run.clientId,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    detail: { clientName: run.client.name, ...detail },
  });
}

/** The `conclude` step, written by code at the end of the run: how it ended, the reasoning of the terminal call, the turn count. */
function recordConclude(run: PlanRun, ending: RunEnding): void {
  recordAudit({
    actorType: 'system',
    action: 'conclude',
    agentInstanceId: run.client.agent_instance_id,
    clientId: run.clientId,
    severity: ending.kind === 'failed' ? 'warning' : undefined,
    detail: { clientName: run.client.name, ...concludeDetail(ending) },
  });
}

/** The name of a checklist row at call time (`documents` is reloaded by the apply steps). Unknown ids give undefined. */
function docName(run: PlanRun, id: string): string | undefined {
  return run.documents.find((d) => d.id === id)?.name;
}

function fileName(run: PlanRun, id: string): string | undefined {
  const f = run.files.find((x) => x.id === id);
  return f ? (f.label ?? f.filename) : undefined;
}

/**
 * Everything the cycle reads before the model is asked: the thread, the
 * checklist, the files, the lost files, the WhatsApp channel, the fetch
 * contexts and the intake state. Throws when no WhatsApp channel is usable.
 */
async function loadPlanningContext(ctx: AgentContext): Promise<PlanRun> {
  const { client } = ctx;
  const clientId = client.id;
  const now = new Date();
  const agentType = ctx.instance?.agent_type ?? DECLARATION_OF_CAPITAL;
  const taxYear = capitalClientTaxYear(client, now);
  const history = await emails.listForClient(clientId);
  const documents = await clientDocuments.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const waState = await loadWaChannelOrThrow(client, now, agentType);
  const documentFetchContexts = await loadDocumentFetchContexts(client, documents, waState, lastInboundWhatsAppAt(history));
  const { intake, attestationConfirmed } = await buildIntakeState(client, history, documents, files);
  const questions = await teamQuestions.listForClient(clientId);
  return {
    ctx,
    client,
    clientId,
    now,
    agentType,
    taxYear,
    history,
    documents,
    files,
    fileById: new Map(files.map((f) => [f.id, f])),
    waState,
    documentFetchContexts,
    intake,
    attestationConfirmed,
    teamQuestions: questions,
    state: { ended: null, asked: false, tied: false, changed: false, pendingAttestationRequest: null, pendingFetch: null },
    calls: [],
    turnResults: new Map(),
    turnDetails: new Map(),
    turnChanges: emptyChecklistChanges(),
    turnHadTies: false,
    deferSteps: false,
    pendingSteps: [],
  };
}

/**
 * The agent is WhatsApp-only: with nothing sendable there is no possible
 * follow-up — fail loudly (drafting-failed marker + manual retry) instead of
 * asking the LLM for a message no channel can carry. Fix by assigning a
 * sender number, opting the client in, or approving a template (waAdmin).
 */
async function loadWaChannelOrThrow(client: ClientRow, now: Date, agentType: string): Promise<WaChannelState> {
  const waState = await getWaChannelState(client, now, agentType);
  if (!waState.allowed) {
    throw new Error(`planFollowUp: the WhatsApp channel is unavailable for client ${client.id}: ${waState.unavailableReason}`);
  }
  return waState;
}

/**
 * When the client last wrote on WhatsApp. The start_login readiness signal
 * must come from the phone-verified WhatsApp channel: email is
 * spoof-adjacent, and a forged "I'm ready" email must never be able to
 * trigger the real OTP email. (The OTP relay is WhatsApp-only anyway.)
 */
function lastInboundWhatsAppAt(history: readonly EmailRow[]): Date | null {
  const lastInboundWa = [...history].reverse().find((m) => m.direction === 'inbound' && m.channel === 'whatsapp');
  return lastInboundWa ? (lastInboundWa.sent_at ?? lastInboundWa.created_at) : null;
}

/**
 * Intake: what the validator lets the model resolve, and where the
 * attestation gate stands. The request is trusted only once its draft
 * actually SENT (sent_at set) — an abandoned draft is not a request — and
 * only inbound messages after that send can confirm it.
 */
async function buildIntakeState(
  client: ClientRow,
  history: readonly EmailRow[],
  documents: readonly ClientDocumentRow[],
  files: readonly DocumentFileRow[],
): Promise<{ intake: IntakeDecisionState; attestationConfirmed: boolean }> {
  // The model quotes from the sanitized transcript it reads (bidi/zero-width
  // chars stripped, fences defanged) — validate against that same view, or
  // legitimate quotes of messages with invisible characters would never match.
  const inboundTexts = new Map(
    history
      .filter((m) => m.direction === 'inbound')
      .map((m) => [m.id, `${sanitizeInline(m.subject ?? '', 300)}\n${sanitizeUntrusted(m.body, 10_000)}`] as const),
  );
  const attestationConfirmed = typeof client.agent_fields['attestation_confirmed_at'] === 'string';
  const requestEmailId = client.agent_fields['attestation_request_email_id'];
  const requestEmail = typeof requestEmailId === 'string' ? await emails.getById(requestEmailId) : null;
  const requestSentAt = requestEmail?.sent_at ?? null;
  const intake: IntakeDecisionState = {
    resolvable: documents
      .filter((d) => d.status === 'unresolved' || d.status === 'not_required')
      .map((d) => ({
        id: d.id,
        status: d.status as 'unresolved' | 'not_required',
        typeKey: d.type_key,
        multiInstance: (d.type_key ? getCatalogType(d.type_key)?.multiInstance : undefined) ?? false,
      })),
    // Already-resolved catalog rows: anchors for added_instances (ladder
    // escalations, late discoveries) and targets for retired_documents.
    typedRows: documents
      .filter((d) => d.type_key !== null && d.status !== 'unresolved' && d.status !== 'not_required')
      .map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        typeKey: d.type_key,
        multiInstance: getCatalogType(d.type_key as string)?.multiInstance ?? false,
        paperKey: d.paper_key,
      })),
    inboundTexts,
    // The approved property papers the planner may cite instead of a quote
    // (openspec `real-estate-goal-driven-clarification`).
    approvedPropertyFiles: approvedPropertyFilesOf(documents),
    // Reports of a known institution in the client's or spouse's name that may
    // create their own item without a quote (openspec `unlisted-files`).
    selfEvidentFiles: selfEvidentFilesOf(files, { clientName: client.name, spouse: readSpouse(client.agent_fields) }),
    allSettled: allDocumentsSettled(documents),
    attestationRequested: requestSentAt !== null,
    confirmableMessageIds: new Set(
      requestSentAt === null
        ? []
        : history
            .filter((m) => m.direction === 'inbound' && (m.sent_at ?? m.created_at) > requestSentAt)
            .map((m) => m.id),
    ),
    attestationConfirmed,
  };
  return { intake, attestationConfirmed };
}

/** Every row is settled: approved, stated in the chat, not needed, or retired. The verification pipeline (or the client's checked statement), not receipt, is what closes a document. */
function allDocumentsSettled(documents: readonly ClientDocumentRow[]): boolean {
  return (
    documents.length > 0 &&
    documents.every((d) => d.status === 'approved' || d.status === 'stated' || d.status === 'not_required' || d.status === 'retired')
  );
}

/**
 * The planner run: builds the prompt from the snapshot, runs the tool loop
 * (decide; executeTurn judges and executes every turn), and bills the tokens
 * to the owning accountant right away, so they count even if the run fails
 * afterwards. Legacy CLI clients have no owner.
 */
async function askPlanner(run: PlanRun): Promise<DecideResult> {
  const { client, clientId } = run;
  const { systemInstruction, contents } = await buildPlannerPrompt(run);
  const result = await decide(systemInstruction, contents, buildDecisionContext(run), (calls, turn) => executeTurn(run, calls, turn), {
    log: {
      userId: client.user_id,
      agentInstanceId: client.agent_instance_id,
      clientId,
      purpose: 'planner',
      planRunId: run.ctx.hints?.planRunId ?? null,
    },
  });
  if (client.user_id) {
    await llmUsage.add(client.user_id, client.agent_instance_id, result.model, result.usage);
  }
  return result;
}

/** The system prompt and the fenced data of this cycle (buildPrompt), with the prompt-only context: fetch states, unsent drafts, verification results, lost files. */
async function buildPlannerPrompt(run: PlanRun): Promise<{ systemInstruction: string; contents: string }> {
  const { ctx, client, clientId, history, documents, files, now, waState, taxYear, intake } = run;
  // Files the client sent that never arrived (openspec `inbound-files`): the
  // model must ask for them again, not read the caption as the document.
  const lostFiles = lostFilesByMessage(
    await auditEvents.listForClientAction(clientId, 'file.ingest_failed'),
    files.map((f) => f.provider_attachment_id),
  );
  const { systemInstruction, contents } = buildPrompt(
    client,
    ctx.accountant,
    history,
    documents,
    files,
    now,
    waState,
    documentFetchPromptInputs(run),
    taxYear,
    {
      unresolvedCount: intake.resolvable.filter((r) => r.status === 'unresolved').length,
      allSettled: intake.allSettled,
      attestation: intake.attestationConfirmed ? 'confirmed' : intake.attestationRequested ? 'requested' : 'none',
    },
    await loadUnsentDrafts(run),
    verificationResultsForPrompt(run),
    // A run after a fetch-delivery batch (openspec `verification-reply`): the section renders even for an empty batch.
    run.ctx.hints?.afterVerification === true,
    (await clientIdNumber(client, 'israel_tax_authority')) !== null,
    lostFiles,
    intake.selfEvidentFiles ?? new Map(),
    run.teamQuestions,
    // The fetch sites a company answer would unlock for each row that names
    // no company (openspec `item-company-clarification`).
    await sitesForUnnamedRows(client, documents, waState),
  );
  return { systemInstruction, contents };
}

/** The document-fetch section of the prompt: per website, its state and the actions the model may pick. */
function documentFetchPromptInputs(run: PlanRun) {
  return run.documentFetchContexts.map((c) => {
    const spec = getProviderSpec(c.provider);
    return {
      provider: c.provider,
      siteNameHe: spec.siteNameHe,
      otpChannel: spec.otpChannel,
      state: c.state,
      available: c.available,
      allowedActions: allowedDocumentFetchActions(c.state, c.available, c.clientOnWhatsapp),
      documentTypes: c.documentTypes.map((d) => ({
        key: d.key,
        descriptionHe: d.descriptionHe,
        pending: d.pendingDocumentId !== null,
        collected: d.collected,
      })),
      takesAllDocuments: spec.takesAllDocuments === true,
    };
  });
}

/**
 * The model's own drafts that never went out (replaced by a newer plan, or
 * parked for review) since its last delivered reply — prompt context only.
 * `history` stays delivered-only: every rule reads what the client saw.
 */
async function loadUnsentDrafts(run: PlanRun) {
  const lastDeliveredOutboundAt = run.history.reduce<Date | null>(
    (latest, m) => (m.direction === 'outbound' && m.sent_at && (!latest || m.sent_at > latest) ? m.sent_at : latest),
    null,
  );
  return emails.listUnsentDraftsForClient(run.clientId, lastDeliveredOutboundAt, MAX_UNSENT_DRAFTS);
}

/**
 * The run after a fetch-delivery batch (openspec `verification-reply`): tell
 * the model which fetched files were just approved or rejected (the reasons
 * live on the rows). A planner tie is answered with its verdict directly.
 */
function verificationResultsForPrompt(run: PlanRun): VerificationResultPromptInput[] {
  return (run.ctx.hints?.verificationResults ?? []).flatMap((r) => {
    const doc = run.documents.find((d) => d.id === r.documentId);
    if (!doc) return [];
    const file = run.files.find((f) => f.id === r.fileId);
    const reasons = (doc.verification as { reasons?: unknown } | null)?.reasons;
    return [
      {
        documentId: doc.id,
        documentName: doc.name,
        fileId: r.fileId,
        fileName: file ? (file.label ?? file.filename) : r.fileId,
        outcome: r.outcome,
        reasons: Array.isArray(reasons) ? reasons.filter((x): x is string => typeof x === 'string') : [],
        // What an approved property paper proved (openspec `real-estate-goal-driven-clarification`).
        provenFacts: provenFactsLine(provenFactsOf(doc)),
      },
    ];
  });
}

/** What the validate_message gate is allowed to accept in this cycle. */
function buildDecisionContext(run: PlanRun): DecisionContext {
  return {
    windowOpen: run.waState.windowOpen,
    templates: run.waState.templates,
    hiddenTemplates: run.waState.hiddenTemplates,
    documentFetch: run.documentFetchContexts.map((c) => ({
      provider: c.provider,
      state: c.state,
      available: c.available,
      clientOnWhatsapp: c.clientOnWhatsapp,
      documentKeys: pendingKeys(c),
    })),
    intake: run.intake,
    openTeamQuestion: openTeamQuestionOf(run.teamQuestions),
  };
}

/** The client's question still waiting for the team, as the gate reads it (openspec `team-questions`). */
function openTeamQuestionOf(questions: readonly TeamQuestionRow[]): DecisionContext['openTeamQuestion'] {
  const open = questions.find((q) => q.closed_at === null);
  return open ? { id: open.id, question: open.question, askedAt: open.asked_at } : null;
}

/**
 * set_required steps — intake resolutions (capital declaration): already
 * validated against the resolvable rows and the evidence quotes
 * (decisionSchema); the DB guards re-check the statuses. The planner gives no
 * injection verdict — that is the dedicated screens' job, before it runs.
 */
async function applyResolutions(run: PlanRun, decision: NormalizedChanges, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  for (const resolution of decision.resolutions) {
    // The call this resolution came from (one set_required per document, by the gate).
    const call = run.calls.find((c) => c.name === 'set_required' && c.args.document_id === resolution.documentId);
    const step = (applied: boolean, createdNames: string[], createdIds: string[] = []) => {
      if (!call) return;
      recordToolStep(run, call, resolveDocumentDetail(call, (id) => docName(run, id), { applied, evidence: resolution.evidence, createdNames, createdIds }), {
        type: 'client_document',
        id: resolution.documentId,
      });
    };
    if (resolution.resolution === 'not_required') {
      const row = await clientDocuments.resolveNotRequired(resolution.documentId, clientId, resolution.evidence);
      if (!row) {
        step(false, []);
        continue;
      }
      changes.applied += 1;
      recordAudit({
        actorType: 'agent',
        action: 'document.resolved',
        agentInstanceId: client.agent_instance_id,
        clientId,
        targetType: 'client_document',
        targetId: row.id,
        detail: {
          clientName: client.name,
          name: row.name,
          typeKey: row.type_key,
          resolution: 'not_required',
          evidence: resolution.evidence,
        },
      });
      step(true, []);
    } else {
      const rows = await clientDocuments.resolveRequired(resolution.documentId, clientId, resolution.instances, resolution.evidence);
      if (!rows) {
        step(false, []);
        continue;
      }
      changes.applied += 1;
      rows.forEach((row, i) =>
        changes.createdWithFiles.push({ row, fileIds: resolution.instances[i]?.fileIds ?? [], anchorId: resolution.documentId, instanceName: resolution.instances[i]?.name ?? row.name }),
      );
      rows.forEach((row, i) => {
        const cost = resolution.instances[i]?.statedCost;
        if (cost) changes.createdStated.push({ row, cost });
        const vehicle = resolution.instances[i]?.statedVehicle;
        if (vehicle) changes.createdStatedVehicles.push({ row, statement: vehicle });
      });
      changes.claimedAtCreation.push(...rows.filter((r) => r.status === 'claimed').map((r) => r.name));
      recordAudit({
        actorType: 'agent',
        action: 'document.resolved',
        agentInstanceId: client.agent_instance_id,
        clientId,
        targetType: 'client_document',
        targetId: resolution.documentId,
        detail: {
          clientName: client.name,
          typeKey: rows[0]?.type_key ?? null,
          resolution: 'required',
          instances: rows.map((r) => r.name),
          evidence: resolution.evidence,
        },
      });
      step(true, rows.map((r) => r.name), rows.map((r) => r.id));
    }
  }
}

/**
 * `set_company` (openspec `item-company-clarification`): a pending row that
 * named no company takes the company the client named — the gate built the
 * new name; this writes it, records the step and the audit event, and reloads
 * the list so a sibling added in the same answer sits next to the renamed
 * head. Runs before apply_additions for that reason.
 */
async function applyCompanies(run: PlanRun, decision: NormalizedChanges, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  if (decision.setCompanies.length === 0) return;
  for (const setting of decision.setCompanies) {
    const call = run.calls.find((c) => c.name === 'set_company' && c.args.document_id === setting.documentId);
    const step = (applied: boolean) => {
      if (!call) return;
      recordToolStep(run, call, setCompanyDetail(call, { applied, ...setting }), { type: 'client_document', id: setting.documentId });
    };
    const row = await clientDocuments.setCompanyName(setting.documentId, clientId, setting.newName);
    if (!row) {
      step(false);
      continue;
    }
    changes.applied += 1;
    recordAudit({
      actorType: 'agent',
      action: 'document.company_set',
      agentInstanceId: client.agent_instance_id,
      clientId,
      targetType: 'client_document',
      targetId: row.id,
      detail: {
        clientName: client.name,
        oldName: setting.oldName,
        name: row.name,
        typeKey: row.type_key,
        company: setting.companyText,
        companyKey: setting.companyKey ?? 'not in table',
        evidence: setting.evidence,
      },
    });
    step(true);
    logger.info('item company set', { clientId, documentId: row.id, name: row.name, companyKey: setting.companyKey });
  }
  run.documents = await clientDocuments.listForClient(clientId);
  publishClientUpdated(clientId);
}

/**
 * Instance additions after resolution (capital declaration): the
 * requirements-ladder escalation and late discoveries. The `add_instance`
 * step of each call is written by collectFiles, once code has decided which
 * of the files the call named the new row may take.
 */
async function applyAdditions(run: PlanRun, decision: NormalizedChanges, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  for (const addition of decision.addedInstances) {
    const rows = await clientDocuments.addInstances(addition.anchorDocumentId, clientId, addition.instances, addition.evidence);
    if (!rows || rows.length === 0) continue;
    changes.applied += 1;
    rows.forEach((row, i) =>
      changes.createdWithFiles.push({ row, fileIds: addition.instances[i]?.fileIds ?? [], anchorId: addition.anchorDocumentId, instanceName: addition.instances[i]?.name ?? row.name }),
    );
    rows.forEach((row, i) => {
      const cost = addition.instances[i]?.statedCost;
      if (cost) changes.createdStated.push({ row, cost });
      const vehicle = addition.instances[i]?.statedVehicle;
      if (vehicle) changes.createdStatedVehicles.push({ row, statement: vehicle });
    });
    changes.claimedAtCreation.push(...rows.filter((r) => r.status === 'claimed').map((r) => r.name));
    recordAudit({
      actorType: 'agent',
      action: 'document.instances_added',
      agentInstanceId: client.agent_instance_id,
      clientId,
      targetType: 'client_document',
      targetId: addition.anchorDocumentId,
      detail: {
        clientName: client.name,
        typeKey: rows[0]?.type_key ?? null,
        instances: rows.map((r) => r.name),
        evidence: addition.evidence,
      },
    });
  }
}

/**
 * apply_retirements — document retirements (capital declaration): the ladder
 * replaced these rows with different documents (evidence-backed;
 * collected/approved rows are valid targets per the office's unit rule).
 */
async function applyRetirements(run: PlanRun, decision: NormalizedChanges, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  // What replaced each row (openspec `retired-by-declaration-tab`): the rows
  // this answer created (apply_additions ran first) and the existing rows it
  // stated a cost or vehicle facts on. The rule reads them by type and paper.
  const createdRows = changes.createdWithFiles.map((c) => c.row);
  const statedIds = new Set([...decision.statedCosts, ...decision.statedVehicles].map((s) => s.documentId));
  const statedRows = run.documents.filter((d) => statedIds.has(d.id));
  for (const retirement of decision.retired) {
    const call = run.calls.find((c) => c.name === 'retire_document' && c.args.document_id === retirement.documentId);
    const target = run.documents.find((d) => d.id === retirement.documentId);
    const replacedBy = replacementOfRetirement({ type_key: target?.type_key ?? null }, createdRows, statedRows);
    const step = (applied: boolean) => {
      if (!call) return;
      recordToolStep(run, call, retireDocumentDetail(call, (id) => docName(run, id), { applied, evidence: retirement.evidence, replacedBy }), {
        type: 'client_document',
        id: retirement.documentId,
      });
    };
    const row = await clientDocuments.retire(retirement.documentId, clientId, retirement.evidence, replacedBy);
    if (!row) {
      step(false);
      continue;
    }
    changes.applied += 1;
    recordAudit({
      actorType: 'agent',
      action: 'document.retired',
      agentInstanceId: client.agent_instance_id,
      clientId,
      targetType: 'client_document',
      targetId: row.id,
      detail: {
        clientName: client.name,
        name: row.name,
        typeKey: row.type_key,
        replacedBy,
        evidence: retirement.evidence,
      },
    });
    step(true);
  }
}

/**
 * apply_stated_costs — a cost declaration closed by the client's own chat
 * message (openspec `chat-stated-cost`): the costs the planner stated on
 * existing pending items, and on the instances this cycle just created. The
 * gate checked the paper, the quote and the amount; here the row is settled
 * ('stated', no file) with the statement as its evidence. Never a collecting
 * answer: nothing is verified afterwards.
 */
async function applyStatedCosts(run: PlanRun, decision: NormalizedChanges, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  // Each target with the state_cost call it came from: by document id for an
  // existing item, by the instance name for a row this cycle created.
  const targets: { documentId: string; cost: StatedCost; call: ParsedToolCall | undefined }[] = [
    ...decision.statedCosts.map((c) => ({
      documentId: c.documentId,
      cost: c,
      call: run.calls.find((x) => x.name === 'state_cost' && x.args.document_id === c.documentId),
    })),
    ...changes.createdStated.map((c) => ({
      documentId: c.row.id,
      cost: c.cost,
      call: run.calls.find((x) => x.name === 'state_cost' && x.args.instance_name === instanceNameOf(changes, c.row.id)),
    })),
  ];
  // Rows created this cycle are not in run.documents yet: name them from the created rows.
  const createdNames = new Map(changes.createdStated.map((c) => [c.row.id, c.row.name]));
  for (const { documentId, cost: target, call } of targets) {
    const evidence = {
      source: 'chat' as const,
      message_id: target.evidence.message_id,
      quote: target.evidence.quote,
      amount: target.amount,
      currency: target.currency,
    };
    const row = await clientDocuments.markStated(documentId, clientId, evidence);
    const step = (ok: boolean) => {
      if (!call) return;
      recordToolStep(run, call, stateCostDetail(call, (id) => docName(run, id) ?? createdNames.get(id), { documentId, applied: ok }), {
        type: 'client_document',
        id: documentId,
      });
    };
    if (!row) {
      step(false);
      continue;
    }
    changes.applied += 1;
    recordAudit({
      actorType: 'agent',
      action: 'document.stated',
      agentInstanceId: client.agent_instance_id,
      clientId,
      targetType: 'client_document',
      targetId: row.id,
      detail: {
        clientName: client.name,
        name: row.name,
        typeKey: row.type_key,
        paperKey: row.paper_key,
        amount: target.amount,
        currency: target.currency,
        evidence: target.evidence,
      },
    });
    step(true);
  }
}

/** The instance name the add_instance call gave a row this cycle created; undefined for any other row. */
function instanceNameOf(changes: ChecklistChanges, rowId: string): string | undefined {
  return changes.createdWithFiles.find((c) => c.row.id === rowId)?.instanceName;
}

/**
 * apply_vehicle_declarations — the client's statement about a vehicle (openspec
 * `vehicle-declaration`): the facts the planner stated on existing vehicle
 * declaration items (pending, or already stated when a later message adds
 * facts) and on the instances this cycle just created. The gate checked the
 * paper, the quote and the facts; here the statement is merged into the row's
 * evidence (newer facts win) and the row is settled ('stated', no file).
 */
async function applyVehicleDeclarations(run: PlanRun, decision: NormalizedChanges, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  const targets: { documentId: string; statement: StatedVehicle; previous: ClientDocumentRow | null; call: ParsedToolCall | undefined }[] = [
    ...decision.statedVehicles.map((v) => ({
      documentId: v.documentId,
      statement: { facts: v.facts, evidence: v.evidence },
      previous: run.documents.find((d) => d.id === v.documentId) ?? null,
      call: run.calls.find((x) => x.name === 'state_vehicle' && x.args.document_id === v.documentId),
    })),
    ...changes.createdStatedVehicles.map((c) => ({
      documentId: c.row.id,
      statement: c.statement,
      previous: null,
      call: run.calls.find((x) => x.name === 'state_vehicle' && x.args.instance_name === instanceNameOf(changes, c.row.id)),
    })),
  ];
  const createdNames = new Map(changes.createdStatedVehicles.map((c) => [c.row.id, c.row.name]));
  for (const target of targets) {
    const evidence = mergeVehicleEvidence(
      target.previous ? vehicleEvidenceOf(target.previous.resolution_evidence, target.previous.paper_key) : null,
      { message_id: target.statement.evidence.message_id, quote: target.statement.evidence.quote },
      target.statement.facts,
    );
    const row = await clientDocuments.markStatedVehicle(target.documentId, clientId, evidence);
    const step = (ok: boolean) => {
      if (!target.call) return;
      recordToolStep(
        run,
        target.call,
        stateVehicleDetail(target.call, (id) => docName(run, id) ?? createdNames.get(id), {
          documentId: target.documentId,
          applied: ok,
          factsLine: vehicleFactsLine(target.statement.facts),
          statementCount: evidence.statements.length,
        }),
        { type: 'client_document', id: target.documentId },
      );
    };
    if (!row) {
      step(false);
      continue;
    }
    changes.applied += 1;
    recordAudit({
      actorType: 'agent',
      action: 'document.stated',
      agentInstanceId: client.agent_instance_id,
      clientId,
      targetType: 'client_document',
      targetId: row.id,
      detail: {
        clientName: client.name,
        name: row.name,
        typeKey: row.type_key,
        paperKey: row.paper_key,
        facts: evidence.facts,
        stated: target.statement.facts,
        evidence: target.statement.evidence,
      },
    });
    step(true);
  }
}

/**
 * After the checklist changed: a reopened checklist voids any earlier
 * attestation (a stale confirmation must never complete the goal over a
 * changed list), the documents are reloaded, and the accountant hears about
 * rows born 'claimed' — the same touchpoint as claim-marks.
 */
async function settleChecklistChanges(run: PlanRun, changes: ChecklistChanges): Promise<void> {
  const { client, clientId, intake } = run;
  if (changes.applied > 0) {
    if (intake && (intake.attestationRequested || intake.attestationConfirmed)) {
      await clients.clearAttestation(clientId);
      run.attestationConfirmed = false;
    }
    run.documents = await clientDocuments.listForClient(clientId);
    publishClientUpdated(clientId);
    logger.info('intake changes applied', { clientId, count: changes.applied });
  }
  if (changes.claimedAtCreation.length > 0) {
    sendClaimedDocumentsEmail(client, changes.claimedAtCreation).catch((err) =>
      logger.error('claimed-documents notification failed', err, { clientId }),
    );
  }
}

/**
 * apply_attestation (confirmed) — the client confirmed the closing summary:
 * validated to cite a real post-summary inbound message; recorded with its
 * evidence.
 */
async function applyAttestationConfirmed(run: PlanRun, decision: NormalizedChanges): Promise<void> {
  if (decision.attestation?.action !== 'confirmed') return;
  const { client, clientId } = run;
  await clients.setAttestationConfirmed(clientId, decision.attestation.evidence);
  run.attestationConfirmed = true;
  recordAudit({
    actorType: 'agent',
    action: 'client.attestation_confirmed',
    agentInstanceId: client.agent_instance_id,
    clientId,
    detail: { clientName: client.name, evidence: decision.attestation.evidence },
  });
  const call = run.calls.find((c) => c.name === 'attestation' && c.args.action === 'confirmed');
  if (call) recordToolStep(run, call, attestationDetail(call, { applied: true }));
}

/**
 * tie_file / mark_collected steps — evidence-gated status updates: the planner proposes,
 * the file evidence decides. 'collected' requires a real file — either the
 * isolated analyzer matched it to the document (tier A), or the planner
 * explicitly paired it with a verified legible non-quarantined file (tier B).
 * A no-file claim ("delivered by fax / in person") lands as 'claimed' and
 * waits for the accountant's confirmation, so conversation text alone can
 * never complete the goal. Unknown ids are ignored throughout.
 *
 * In order: the company/employer split of the tied items, the collect-or-claim
 * decision, the status writes, the file links, the step row.
 */
async function collectFiles(run: PlanRun, decision: Pick<NormalizedChanges, 'matched_files' | 'collected_document_ids'>, changes: ChecklistChanges): Promise<CollectionOutcome> {
  const { clientId, fileById } = run;
  const pendingIds = new Set(run.documents.filter((d) => d.status === 'pending').map((d) => d.id));
  const pendingBefore: ReadonlySet<string> = new Set(pendingIds);
  const documentIds = new Set(run.documents.map((d) => d.id));
  // A split parent (058) is never paired: its children are, each on its own.
  // The company check (institutions.ts) then refuses a pair between two
  // different companies, and a pair with a file of an unidentified company
  // unless the client's own words back it; an item that names no company is
  // paired on the type agreement alone.
  const companyChecked = filterPairsByCompany(applicableFilePairs(decision.matched_files, fileById, documentIds), fileById, run.documents);
  const { splitPairs, splitDetail, pairs: splitAllowedPairs } = await splitItemsByCompany(run, companyChecked.allowed);
  const splitTouched = new Set([...splitDetail.renamed.map((r) => r.documentId), ...splitDetail.created.map((c) => c.documentId)]);
  for (const c of splitDetail.created) pendingIds.add(c.documentId); // born pending, after the snapshot above
  // Files the model named for rows it created in this cycle: code decides which
  // of them a new row may take; an accepted file makes the row collectable now.
  const newRowFiles = assignFilesToNewRows(changes.createdWithFiles, fileById);
  const proposedPairs: { file_id: string; document_id: string }[] = [...splitAllowedPairs, ...splitPairs, ...newRowFiles.pairs];
  const refusedTies = [...companyChecked.refused, ...newRowFiles.refused];
  if (refusedTies.length > 0) logger.warn('file-to-document ties refused', { clientId, refusedTies });
  const modelCollected = new Set(decision.collected_document_ids);
  const proposedCollected = [
    ...new Set([
      ...decision.collected_document_ids,
      ...newRowFiles.pairs.map((p) => p.document_id),
      // A row the split created is collected when its source item was.
      ...splitDetail.created.filter((c) => modelCollected.has(c.fromDocumentId)).map((c) => c.documentId),
    ]),
  ];
  const { newlyCollected, newlyClaimed } = decideCollectOrClaim(run, proposedCollected, pendingIds, proposedPairs, refusedTies);
  await markCollected(run, newlyCollected);
  await markClaimed(run, newlyClaimed);
  await linkFilesToDocuments(run, proposedPairs);
  const outcome: CollectionOutcome = { newlyCollected, newlyClaimed, proposedCollected, proposedPairs, refusedTies, splitDetail, splitTouched };
  recordAddInstanceSteps(run, changes, newRowFiles);
  recordCollectionSteps(run, outcome, { pendingIds: pendingBefore, documentIds });
  return outcome;
}

/**
 * The `add_instance` step of every call of this answer, written once code
 * decided which of the files the call named the new row may take
 * (assignFilesToNewRows): the row it created, its status, the accepted and
 * the refused files. A call whose row was not created still gets its step.
 */
function recordAddInstanceSteps(run: PlanRun, changes: ChecklistChanges, newRowFiles: ReturnType<typeof assignFilesToNewRows>): void {
  const used = new Set<string>();
  for (const call of run.calls) {
    if (call.name !== 'add_instance') continue;
    const created = changes.createdWithFiles.find(
      (c) => !used.has(c.row.id) && c.anchorId === call.args.anchor_document_id && c.instanceName === call.args.name,
    );
    if (created) used.add(created.row.id);
    recordToolStep(
      run,
      call,
      addInstanceDetail(call, (id) => docName(run, id), (id) => fileName(run, id), {
        row: created ? { id: created.row.id, name: created.row.name, status: created.row.status } : null,
        // The call's own quote / cited file: the validated evidence lives on the row's audit event.
        evidence: null,
        acceptedFileIds: created ? newRowFiles.pairs.filter((p) => p.document_id === created.row.id).map((p) => p.file_id) : [],
        refused: created ? newRowFiles.refused.filter((r) => r.document_id === created.row.id) : [],
      }),
      created ? { type: 'client_document', id: created.row.id } : undefined,
    );
  }
}

/** The `tie_file` and `mark_collected` steps of this answer, in call order, each with the outcome the collect step gave it. */
function recordCollectionSteps(run: PlanRun, o: CollectionOutcome, before: { pendingIds: ReadonlySet<string>; documentIds: ReadonlySet<string> }): void {
  const steps = attributeCollectionOutcome(run.calls, o, {
    pendingIds: before.pendingIds,
    documentIds: before.documentIds,
    fileById: run.fileById,
    docName: (id) => docName(run, id),
    fileName: (id) => fileName(run, id),
  });
  for (const step of steps) recordToolStep(run, step.call, step.detail, step.target);
}

/**
 * Per-company split (openspec `unlisted-files`): an item that names no
 * company ("ביטוח מנהלים ניב") takes the name of the first company whose
 * file is tied to it, and every further company gets its own sibling row —
 * code over this cycle's allowed pairs (planCompanySplit, pure), before the
 * collect decision, so each resulting row is collected and verified on its
 * own file. Returns the pairs re-pointed at the rows that now hold them.
 */
async function splitItemsByCompany(
  run: PlanRun,
  allowedPairs: ReturnType<typeof filterPairsByCompany>['allowed'],
): Promise<{ pairs: ReturnType<typeof filterPairsByCompany>['allowed']; splitPairs: { file_id: string; document_id: string }[]; splitDetail: CompanySplitDetail }> {
  const { client, clientId, fileById } = run;
  const split = planCompanySplit(allowedPairs, fileById, run.documents);
  const splitPairs: { file_id: string; document_id: string }[] = [];
  const splitDetail: CompanySplitDetail = { renamed: [], created: [] };
  if (split.renames.length > 0 || split.created.length > 0) {
    // Every item the split touched: renamed, given siblings, or both (an item
    // that already names its company is divided by employer without a rename;
    // its unchanged name still goes through the write, which is what checks
    // the row is live).
    const touchedIds = [...new Set([...split.renames.map((r) => r.documentId), ...split.created.map((c) => c.fromDocumentId)])];
    const items = touchedIds.map((documentId) => ({
      documentId,
      newName: split.renames.find((r) => r.documentId === documentId)?.newName ?? (docName(run, documentId) ?? ''),
      siblings: split.created.filter((c) => c.fromDocumentId === documentId).map((c) => ({ name: c.name, evidence: c.evidence })),
    }));
    const { created, skipped } = await clientDocuments.splitByCompany(clientId, items);
    items.forEach((item, i) => {
      const siblings = split.created.filter((c) => c.fromDocumentId === item.documentId);
      const rows = created[i] ?? [];
      if (skipped.includes(item.documentId)) {
        // The head raced out of a live status: nothing of this item changed,
        // so the files planned for siblings go back to the head as before.
        for (const c of siblings) for (const fileId of c.fileIds) splitPairs.push({ file_id: fileId, document_id: item.documentId });
        return;
      }
      const rename = split.renames.find((r) => r.documentId === item.documentId);
      if (rename) splitDetail.renamed.push(rename);
      siblings.forEach((c, j) => {
        const row = rows[j];
        if (!row) {
          for (const fileId of c.fileIds) splitPairs.push({ file_id: fileId, document_id: item.documentId });
          return;
        }
        for (const fileId of c.fileIds) splitPairs.push({ file_id: fileId, document_id: row.id });
        splitDetail.created.push({ documentId: row.id, name: row.name, fromDocumentId: item.documentId, fileId: c.evidence.file_id, employer: c.employer });
        recordAudit({
          actorType: 'system',
          action: 'document.instances_added',
          agentInstanceId: client.agent_instance_id,
          clientId,
          targetType: 'client_document',
          targetId: item.documentId,
          detail: {
            clientName: client.name,
            typeKey: row.type_key,
            instances: [row.name],
            evidence: c.evidence,
            reason: c.employer !== null ? 'employer_split' : 'company_split',
            fromName: rename?.oldName ?? item.newName,
          },
        });
      });
    });
    logger.info('items split by company and employer', {
      clientId,
      renamed: splitDetail.renamed.map((r) => ({ id: r.documentId, name: r.newName })),
      created: splitDetail.created.map((c) => ({ id: c.documentId, name: c.name })),
      skipped,
    });
    run.documents = await clientDocuments.listForClient(clientId);
    publishClientUpdated(clientId);
  }
  return { pairs: split.pairs, splitPairs, splitDetail };
}

/**
 * Collect or claim: a proposed document is collected when a real file earned
 * it (a strong analyzer match, or a verified legible pair); it is claimed
 * when the client says it was delivered another way; it stays pending when
 * the model rested it on a file code refused to tie.
 */
function decideCollectOrClaim(
  run: PlanRun,
  proposedCollected: readonly string[],
  pendingIds: ReadonlySet<string>,
  proposedPairs: readonly { file_id: string; document_id: string }[],
  refusedTies: readonly { document_id: string }[],
): { newlyCollected: string[]; newlyClaimed: string[] } {
  const newlyCollected: string[] = [];
  const newlyClaimed: string[] = [];
  for (const id of proposedCollected) {
    if (!pendingIds.has(id)) continue;
    const strongMatch = run.files.some((f) => fileMatchesDocument(f, id));
    const paired = proposedPairs.find((m) => m.document_id === id);
    const pairedFile = paired ? run.fileById.get(paired.file_id) : undefined;
    if (strongMatch || (pairedFile && isVerifiedLegibleFile(pairedFile))) {
      newlyCollected.push(id);
    } else if (refusedTies.some((r) => r.document_id === id)) {
      continue;
    } else {
      newlyClaimed.push(id);
    }
  }
  return { newlyCollected, newlyClaimed };
}

/** The documents a real file earned become 'collected'. */
async function markCollected(run: PlanRun, newlyCollected: string[]): Promise<void> {
  if (newlyCollected.length === 0) return;
  const { client, clientId } = run;
  await clientDocuments.markCollected(clientId, newlyCollected);
  logger.info('documents marked collected', { clientId, documentIds: newlyCollected });
  recordAudit({
    actorType: 'agent',
    action: 'document.collected',
    agentInstanceId: client.agent_instance_id,
    clientId,
    targetType: 'client_document',
    detail: { clientName: client.name, documentIds: newlyCollected, names: newlyCollected.map((id) => docName(run, id) ?? id) },
  });
}

/** The documents the client says were delivered another way become 'claimed' and wait for the accountant's confirmation. */
async function markClaimed(run: PlanRun, newlyClaimed: string[]): Promise<void> {
  if (newlyClaimed.length === 0) return;
  const { client, clientId } = run;
  await clientDocuments.markClaimed(clientId, newlyClaimed);
  logger.info('documents marked claimed (await accountant confirmation)', { clientId, documentIds: newlyClaimed });
  const claimedNames = run.documents.filter((d) => newlyClaimed.includes(d.id)).map((d) => d.name);
  recordAudit({
    actorType: 'agent',
    action: 'document.claimed',
    agentInstanceId: client.agent_instance_id,
    clientId,
    targetType: 'client_document',
    detail: { clientName: client.name, documentIds: newlyClaimed, names: claimedNames },
  });
  // Fire-and-forget like the other notifications; re-claims can't repeat (the rows left 'pending').
  sendClaimedDocumentsEmail(client, claimedNames).catch((err) =>
    logger.error('claimed-documents notification failed', err, { clientId }),
  );
}

/**
 * File a received file under the required document it satisfies. Quarantined
 * files (suspected injection / illegible) are never filed anywhere. A child
 * cut out of a multi-document PDF carries the name of its list document: kept
 * in step when the planner files it under another row.
 */
async function linkFilesToDocuments(run: PlanRun, proposedPairs: readonly { file_id: string; document_id: string }[]): Promise<void> {
  const { clientId, fileById } = run;
  for (const match of proposedPairs) {
    const file = fileById.get(match.file_id);
    if (!file || isQuarantined(file)) continue;
    await documentFiles.linkToDocument(match.file_id, clientId, match.document_id);
    if (file.parent_file_id !== null) {
      await documentFiles.setLabel(file.id, childDisplayName(docName(run, match.document_id)));
    }
    logger.info('file linked to document', { clientId, fileId: match.file_id, documentId: match.document_id });
  }
}

/**
 * Which file each just-collected document is verified against: the
 * analyzer's own match (tier A), else the planner's pairing (tier B).
 * `files` is oldest-first: when several files match the same item (a re-sent
 * report after a failed check), the newest one is the file the client just
 * sent, so it is the one to verify. An item the split touched is verified
 * against the file tied to it in this cycle: `files` is the pre-link
 * snapshot, so a sibling's file (whose stored match still names the head)
 * would otherwise pass as the head's.
 */
function pickVerificationTargets(run: PlanRun, o: CollectionOutcome): { documentId: string; fileId: string }[] {
  return o.newlyCollected.flatMap((id) => {
    const tierA = [...run.files].reverse().find((f) => fileMatchesDocument(f, id));
    const paired = o.proposedPairs.find((m) => m.document_id === id);
    const fileId = o.splitTouched.has(id) ? (paired?.file_id ?? tierA?.id) : (tierA?.id ?? paired?.file_id);
    return fileId ? [{ documentId: id, fileId }] : [];
  });
}

/**
 * goal.completed — the `goal_complete` terminal call (openspec
 * `planner-answer-tools`): accepted only when every row is settled AND the
 * client confirmed the attestation summary, judged on the live documents, not
 * on the model's word; clients with no configured documents trust the call
 * (legacy behavior). Refused otherwise, with the reason as the result, and the
 * run goes on. On acceptance the pending fetch action lands, the goal flips to
 * complete, the closing message goes out and the accountant is told.
 */
async function completeGoal(run: PlanRun, call: ParsedToolCall): Promise<void> {
  const { client, clientId, documents, agentType, taxYear } = run;
  const judged = judgeGoalComplete(call, { hasDocuments: documents.length > 0, allSettled: allDocumentsSettled(documents), attestationConfirmed: run.attestationConfirmed }, judgeStateOf(run.state));
  if (!judged.ok) {
    refuseCall(run, call, judged.refusal);
    return;
  }
  run.state.ended = { kind: 'goal_complete', call };
  // No message is drafted on this path; a fresh offer can't happen here (no
  // pending matching document left), but cancel/agreed actions still need to land.
  const fetch = documentFetchDecisionOf(run);
  await applyDocumentFetchAction(client, fetch.action, fetch.targetCtx, fetch.keys, taxYear, { emailId: null, delayMs: 0 });
  recordDocumentFetchStep(run, fetch, null);
  recordToolStep(run, call, { tool: call.name, ...(call.turn !== undefined ? { turn: call.turn } : {}), reasoning: String(call.args.reasoning ?? ''), applied: true, reason: 'goal completed (every row settled and the attestation confirmed)' });
  await clients.updateGoalStatus(clientId, 'complete');
  // Report the finished collection back to the board row's documents status column.
  void syncMondayDocumentsStatus(clientId);
  publishClientUpdated(clientId);
  logger.info('goal complete', { clientId, reasoning: String(call.args.reasoning ?? '') });
  recordAudit({
    actorType: 'agent',
    action: 'goal.completed',
    agentInstanceId: client.agent_instance_id,
    clientId,
    detail: { agent: agentType, clientName: client.name },
  });
  // Fire-and-forget; skipped for document-less clients (trivially "complete"
  // on arrival, e.g. monday imports) where the email would be nonsense.
  if (documents.length > 0) {
    const closing = await sendClosingMessage(client, run.now);
    recordPlannerStep(run, 'send_closing', closing.sent ? { emailId: closing.emailId } : { skipped: closing.reason });
    sendGoalCompleteEmail(client).catch((err) => logger.error('goal-complete notification failed', err, { clientId }));
  }
}

/** The `document_fetch` step: the action the call asked for and whether a fetch context took it. */
function recordDocumentFetchStep(run: PlanRun, fetch: ReturnType<typeof documentFetchDecisionOf>, emailId: string | null): void {
  const call = run.state.pendingFetch?.call;
  if (!call) return;
  run.state.pendingFetch = null;
  recordToolStep(
    run,
    call,
    documentFetchDetail(call, { applied: fetch.action !== null && fetch.targetCtx !== null, provider: fetch.targetCtx?.provider ?? null, documentKeys: fetch.keys, emailId }),
  );
}

/**
 * send_closing — the fixed closing message after the goal completes (openspec
 * `declaration-completion`): thanks, and the accountant will be in touch if
 * needed. Sent at once as a free-form WhatsApp text inside an open 24h window
 * (the confirmation turn runs seconds after the client's message); outside the
 * window, or with no sender / number, it is skipped — never a template. Called
 * after the goal flipped to complete, so it bypasses the scheduled-send path
 * on purpose: the worker refuses to send once the goal is complete, and a
 * fixed text needs no review or schedule. A provider failure is logged; the
 * goal stays complete. Both completion paths call it (plan + manual toggle).
 */
export async function sendClosingMessage(
  client: ClientRow,
  now: Date,
): Promise<{ sent: true; emailId: string } | { sent: false; reason: string }> {
  try {
    const [wa, sender, accountant] = await Promise.all([
      getWaChannelState(client, now, DECLARATION_OF_CAPITAL),
      client.agent_instance_id ? waSenders.getByInstanceId(client.agent_instance_id) : null,
      client.user_id ? users.getById(client.user_id) : null,
    ]);
    const delivery = closingMessageDelivery(client, accountant, wa, sender);
    if (!delivery.send) {
      logger.info('closing message skipped', { clientId: client.id, reason: delivery.reason });
      return { sent: false, reason: delivery.reason };
    }
    const row = await sendWhatsAppTextAndRecord(client.id, {
      from: delivery.from,
      to: delivery.to,
      body: delivery.body,
      reasoning: 'closing message after the goal completed',
      agentInstanceId: client.agent_instance_id,
    });
    publishClientUpdated(client.id);
    logger.info('closing message sent', { clientId: client.id, emailId: row.id });
    return { sent: true, emailId: row.id };
  } catch (err) {
    logger.error('closing message failed', err, { clientId: client.id });
    return { sent: false, reason: 'send failed' };
  }
}

/** The document-fetch step the run accepted (client agreed / start login / cancel), with the website it is about. */
function documentFetchDecisionOf(run: PlanRun) {
  const documentFetchDecision = run.state.pendingFetch?.decision ?? null;
  return {
    action: documentFetchDecision?.action ?? null,
    targetCtx: documentFetchDecision ? (run.documentFetchContexts.find((c) => c.provider === documentFetchDecision.provider) ?? null) : null,
    keys: documentFetchDecision?.documentKeys ?? null,
  };
}

/** The accepted message call of a run: the validated message, its send time, the call's reasoning and the call itself. */
interface ReplyInput {
  message: FollowUpMessage;
  sendAt: string;
  reasoning: string;
  call: ParsedToolCall;
}

/**
 * send_whatsapp_* — the run's message, the terminal call: its send time is
 * rolled off weekends and chagim (sendAtGuard), the draft is scheduled (review
 * mode or the send job), the attestation request is stamped on this very draft
 * when the message is the closing summary, and the document-fetch action lands
 * after the draft exists (start_login is enqueued against the heads-up draft,
 * so the browser login — and the OTP it triggers — can only run after that
 * message actually goes out). Ends the run.
 */
async function scheduleReply(run: PlanRun, decision: ReplyInput): Promise<void> {
  const { client, clientId, history, now, taxYear } = run;
  // The LLM answers with a wall-clock datetime in the accountant's timezone.
  const sendAtGuard = rollBlockedSendAt(decision.sendAt, lastInboundMessageAt(history), now);
  if (sendAtGuard.rolled) {
    logger.warn('proactive send_at fell on a weekend or chag; rolled forward', {
      clientId,
      requested: decision.sendAt,
      send_at: sendAtGuard.sendAt,
    });
  }
  // "asap" (openspec `reply-send-asap`): the code picks the time — now + 1s —
  // and from here on the draft is scheduled exactly like a model-chosen time.
  const resolved = resolveSendAt(sendAtGuard.sendAt, new Date(), env.ACCOUNTANT_TIMEZONE);
  const sendAtUtc = resolved.sendAtUtc;
  const sendAtLabel = resolved.sendAtLocal;
  const delayMs = sendAtUtc.getTime() - Date.now();
  if (delayMs < 0 && resolved.requested === 'time') {
    logger.warn('LLM send_at is in the past; sending immediately', { clientId, send_at: sendAtLabel });
  }
  // WhatsApp only (openspec `planner-answer-schema`): the message is free-form text or a rendered template.
  const message = decision.message;
  const body = message.kind === 'freeform' ? message.body : message.renderedBody;
  const { emailId } = await scheduleDraftMessage(clientId, {
    channel: message.channel,
    subject: '',
    body,
    waContentSid: message.kind === 'template' ? message.contentSid : null,
    waContentVariables: message.kind === 'template' ? message.variables : null,
    delayMs: Math.max(0, delayMs),
    reasoning: decision.reasoning,
    // Held first message (openspec `first-message-approval`): stored, not queued.
    hold: run.ctx.hints?.hold === true,
    // Draft outcome (openspec `discarded-message-analytics`): the cycle's trigger and id.
    planTrigger: run.ctx.hints?.trigger ?? null,
    planRunId: run.ctx.hints?.planRunId ?? null,
  });
  run.state.ended = { kind: 'message', call: decision.call, emailId, sendAt: sendAtLabel };
  // A message in the same turn as a tie was written before the verdict was known (openspec `verification-reply`).
  const beforeVerdict = run.turnHadTies;
  const sendDetail = sendMessageDetail(decision.call, {
    emailId,
    sendAt: sendAtLabel,
    requestedSendAt: decision.sendAt,
    requested: resolved.requested,
    rolled: sendAtGuard.rolled,
    chars: body.length,
    templateName: message.kind === 'template' ? (run.waState.templates.find((t) => t.content_sid === message.contentSid)?.name ?? null) : null,
  });
  recordToolStep(
    run,
    decision.call,
    {
      ...sendDetail,
      ...(beforeVerdict ? { beforeVerdict: true } : {}),
      result: `${sendDetail.reason}; the run ended${beforeVerdict ? ' · note: this message was written in the same turn as a tie, before its verdict was known — next time send after the tie results' : ''}`,
    },
    { type: 'email', id: emailId },
  );
  await applyAttestationRequest(run, emailId, sendAtLabel, resolved.requested);
  const fetch = documentFetchDecisionOf(run);
  await applyDocumentFetchAction(client, fetch.action, fetch.targetCtx, fetch.keys, taxYear, {
    emailId,
    delayMs: Math.max(0, delayMs),
  });
  recordDocumentFetchStep(run, fetch, emailId);
  logger.info('follow-up scheduled', {
    clientId,
    channel: message.channel,
    kind: message.kind,
    send_at: sendAtLabel,
    requested: resolved.requested,
    send_at_utc: sendAtUtc.toISOString(),
    reasoning: decision.reasoning,
  });
}

/**
 * apply_attestation (request) — this very draft is the closing summary.
 * Stamped by email id — the confirmation validator only trusts it once the
 * row actually sent, so an abandoned draft never becomes a request.
 */
async function applyAttestationRequest(run: PlanRun, emailId: string, sendAt: string, requested: 'asap' | 'time'): Promise<void> {
  const call = run.state.pendingAttestationRequest;
  if (!call) return;
  run.state.pendingAttestationRequest = null;
  const { client, clientId } = run;
  await clients.setAttestationRequest(clientId, emailId);
  recordAudit({
    actorType: 'agent',
    action: 'client.attestation_requested',
    agentInstanceId: client.agent_instance_id,
    clientId,
    detail: { clientName: client.name, emailId, send_at: sendAt, requested },
  });
  recordToolStep(run, call, attestationDetail(call, { applied: true, emailId }), { type: 'email', id: emailId });
}
