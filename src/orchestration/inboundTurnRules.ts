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
  if (isTurnSettled(state, now, limits.quietMs)) return 'plan';
  return now.getTime() - turnStartedAt.getTime() >= limits.maxWaitMs ? 'force' : 'wait';
}
