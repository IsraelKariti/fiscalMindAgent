/**
 * The pure rules of the inbound turn (openspec `inbound-turn`): when the
 * planner may run after inbound client activity. No I/O here — the Redis and
 * queue side lives in inboundTurnCore.ts.
 */

/** What is known about a client's current turn when the deferred re-plan fires. */
export interface TurnState {
  /** Inbound webhook handlers of the client still running (download, screens, splitting, classification). */
  inflight: number;
  /** When the client's most recent inbound webhook arrived; null when unknown (keys expired or lost). */
  lastInboundAt: Date | null;
  /** Recent document_files rows of the client still waiting for an analysis result. */
  pendingFiles: number;
  /**
   * A provider outage hold stands in the way (openspec `llm-provider-outage`):
   * the planner's own provider is held, or the client has a message or file
   * waiting for the provider. The turn then waits — past the maximum wait too.
   */
  held?: boolean;
}

/**
 * Why an unsettled turn waits (openspec `turn-activity-states`): 'work' while
 * inputs are still being handled (or held) — the workspace shows "processing";
 * 'quiet' when only the quiet window is left — the workspace shows nothing.
 */
export function waitKindOf(state: TurnState): 'work' | 'quiet' {
  return state.held || state.inflight > 0 || state.pendingFiles > 0 ? 'work' : 'quiet';
}

/** The turn is settled when nothing is being processed and the client has been quiet for the whole window. */
export function isTurnSettled(state: TurnState, now: Date, quietMs: number): boolean {
  if (state.inflight > 0) return false;
  if (state.pendingFiles > 0) return false;
  if (state.lastInboundAt !== null && now.getTime() - state.lastInboundAt.getTime() < quietMs) return false;
  return true;
}

export type ReplanDecision = 'plan' | 'wait' | 'force';

/**
 * What the deferred re-plan does when it fires: plan once the turn is settled,
 * wait while it is not, and plan anyway ('force') once the turn has waited the
 * maximum — a hung file or a client who never stops must not block the reply.
 */
export function decideReplan(
  state: TurnState,
  turnStartedAt: Date,
  now: Date,
  limits: { quietMs: number; maxWaitMs: number },
): ReplanDecision {
  // A hold is not a hung file: the planner could not run anyway, and forcing
  // would plan without the held messages and files. Wait for the recovery.
  if (state.held) return 'wait';
  if (isTurnSettled(state, now, limits.quietMs)) return 'plan';
  return now.getTime() - turnStartedAt.getTime() >= limits.maxWaitMs ? 'force' : 'wait';
}
