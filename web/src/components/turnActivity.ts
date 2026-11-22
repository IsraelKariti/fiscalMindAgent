/**
 * What the agent is doing for a client right now, as the conversation
 * timeline shows it (openspec `turn-activity-states`). Pure: the page passes
 * the client read and the clock; tests run it without React.
 *
 * - 'held'       — a provider outage holds the client's work (calm notice, no retry)
 * - 'failed'     — the last planning attempt threw (notice + Retry)
 * - 'processing' — the turn's inputs are being analyzed (fresh processing stamp)
 * - 'drafting'   — a planner run is writing the message (fresh drafting stamp)
 * - 'stuck'      — a stamp went stale, or nothing is queued, scheduled or
 *                  happening for the stale limit (notice + Retry)
 * - 'waiting'    — a planner run is queued for later (quiet window, after-send
 *                  wait): the timeline shows nothing
 * - 'idle'       — nothing queued or stamped, but too recent to call stuck:
 *                  the timeline shows nothing
 * - null         — the goal is not open, the client is deleted, or paused with
 *                  no held first draft: the other notices (paused, complete) apply
 */
export type TurnActivity = 'held' | 'failed' | 'processing' | 'drafting' | 'stuck' | 'waiting' | 'idle' | null;

/** A stamp older than this is an attempt that died mid-flight (one planner call, a file, a verification each take far less). */
export const ACTIVITY_STALE_MS = 3 * 60_000;

export interface TurnActivityInput {
  client: {
    goal_status: string;
    paused: boolean;
    deletedAt: string | null;
    drafting_since: string | null;
    processing_since?: string | null;
    draft_failed_at: string | null;
    outage_held_at: string | null;
  };
  /** A send is scheduled: the agent is between turns, nothing to show here. */
  hasScheduled: boolean;
  /** When the queued planner run is due; null = none queued. */
  planWaitUntil: string | null;
  /** The newest timeline activity (last message), for the lost-run stale check; null when the thread is empty. */
  lastActivityAt: string | null;
  now: number;
}

export function resolveTurnActivity(input: TurnActivityInput): TurnActivity {
  const { client, now } = input;
  if (client.deletedAt != null || client.goal_status !== 'pending' || input.hasScheduled) return null;
  const drafting = client.drafting_since != null;
  const processing = client.processing_since != null;
  const failed = client.draft_failed_at != null;
  // A paused client has nothing to show — except a never-contacted client whose
  // first message is being drafted and held (openspec `first-message-approval`).
  if (client.paused && !drafting && !failed) return null;
  if (client.outage_held_at != null) return 'held';
  if (failed) return 'failed';
  const ageOf = (iso: string): number => now - new Date(iso).getTime();
  if (drafting) return ageOf(client.drafting_since!) > ACTIVITY_STALE_MS ? 'stuck' : 'drafting';
  if (processing) return ageOf(client.processing_since!) > ACTIVITY_STALE_MS ? 'stuck' : 'processing';
  if (input.planWaitUntil != null) return 'waiting';
  // Nothing stamped, queued or scheduled: a lost run once it has been quiet long enough.
  if (input.lastActivityAt != null && ageOf(input.lastActivityAt) > ACTIVITY_STALE_MS) return 'stuck';
  return 'idle';
}
