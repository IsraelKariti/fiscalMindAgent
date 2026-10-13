/**
 * What resuming a paused client does with its preserved send (pure rule;
 * resumeFutureEmail applies it). Openspec `first-message-approval`:
 * - 'restore': the planned time is still ahead — the same draft is re-queued for it.
 * - 'send_now': the planned time passed — the same draft is sent immediately
 *   (the workspace warned the accountant before the resume).
 * - 'already_queued': the job is still (or again) in the queue — nothing to do.
 * - 'keep': the draft is held for admin review (048) — the worker already ran
 *   and parked it, so its finished job sits on the id. Nothing to re-queue:
 *   the admin's approval sends it (under its own job id). A redraft here would
 *   throw away the draft the admin is reviewing and alert them again.
 * - 'redraft': nothing preserved, or the mirror row cannot be re-queued
 *   (unparseable job id, or a finished job squatting on the id) — fresh plan.
 */
export type ResumeAction = 'restore' | 'send_now' | 'already_queued' | 'keep' | 'redraft';

/** BullMQ states in which the send is still on its way and must not be re-added. */
const QUEUED_STATES = new Set(['delayed', 'waiting', 'waiting-children', 'active', 'prioritized']);

export function resumeAction(args: {
  row: { bullmq_job_id: string; scheduled_for: Date } | null;
  /** The queue's state for the row's job id; null when no job exists under it. */
  jobState: string | null;
  /** True when the row's draft has status 'held' (parked for admin review). */
  draftHeld?: boolean;
  now: Date;
}): ResumeAction {
  const { row, jobState, draftHeld = false, now } = args;
  if (!row) return 'redraft';
  if (draftHeld) return 'keep';
  if (jobState !== null && QUEUED_STATES.has(jobState)) return 'already_queued';
  const [, jobClientId, emailId] = row.bullmq_job_id.split(':');
  if (!jobClientId || !emailId || jobState !== null) return 'redraft';
  return row.scheduled_for.getTime() > now.getTime() ? 'restore' : 'send_now';
}
