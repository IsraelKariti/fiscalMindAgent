## Context

See proposal.md — Why. Current flow (`docs/pipeline.md`, row `send_reply`): the planner answers `follow_up` with `send_at` as "YYYY-MM-DD HH:MM" in the accountant's timezone; `normalizeDecision` rejects anything that is not a wall-clock datetime; `scheduleReply` (`src/agents/declarationOfCapital/plan.ts`) passes it through `rollBlockedSendAt` (`src/agents/shared/sendAtGuard.ts`), converts it to UTC, and calls `scheduleDraftMessage` with `delayMs = max(0, sendAt - now)`. A negative delay already sends at once (logged as "send_at in the past"). `scheduleDraftMessage` already handles delay 0 safely: the review-mode flag is written before the job is queued, and the `hold` path stores the draft without queueing.

The planner runs once per client turn, 15 s after the client's last inbound (`INBOUND_QUIET_SECONDS`); that wait is unchanged and is the floor for any reply.

## Goals / Non-Goals

**Goals:**
- Let the model say "send now" without inventing a time, and have the platform honour it with zero delay.
- Keep every existing send-time gate (review mode, held first message, 24h-window check in the worker) untouched.
- Make the choice visible in the trace and testable in evals.

**Non-Goals:**
- No code rule that forces an immediate send based on timestamps (explicitly rejected by the owner).
- No change to the quiet window, to reminders, or to the first-message timing rules.
- No UI change.

## Decisions

1. **Marker = `send_at: "asap"`, not a new boolean.**
   One field keeps the collect/goal_complete contract unchanged ("every message field and `send_at` null"), the keep-alive contract line stays "exactly one message + `send_at`", and the model cannot send contradictory values (a time and a flag). Alternative considered: `send_now: boolean` — rejected because it adds a second field the gate must cross-check against `send_at` in every decision value.

2. **Validation in `normalizeDecision`:** `send_at` on `follow_up` must be a wall-clock datetime or exactly `asap` (trimmed, lower-case). The corrected-answer hint in `decisionSchema.ts` and the zod field comment mention both forms. `collect` / `goal_complete` keep the "null only" rule, so `asap` on them is rejected by the existing branch.

3. **The code picks the time; one pure function resolves it.** Add `resolveSendAt(sendAt: string, now: Date, timeZone: string): { sendAtUtc: Date; sendAtLocal: string; requested: 'asap' | 'time' }` next to `rollBlockedSendAt` in `sendAtGuard.ts`: for `asap` it returns `now + 1 s` (and its "YYYY-MM-DD HH:MM:SS" wall-clock label in the accountant's timezone); for a wall-clock time it runs the existing zoned conversion. `scheduleReply` then continues exactly as today with a concrete instant: `delayMs = max(0, sendAtUtc - now)`, so the only difference from a model-chosen time is who chose it. The one-second delay is intentional: the planner holds the client lock until it returns, so the send job waits for the lock anyway; the second keeps the planned time in the future for the timeline and the review flow. `rollBlockedSendAt` runs before resolution and passes `asap` through untouched (its regex does not match), so the proactive roll-forward never applies to it — and the prompt forbids `asap` for proactive messages anyway.

4. **Trace and timeline.** `send_reply` step detail records `send_at` as the picked time and a new `requested: 'asap'` key; the attestation detail and the log carry the same pair. `scheduledFor` in `scheduled_jobs` is the picked instant, so the timeline and the review alert email show a normal time with no change. Because the label is to the second, the trace never shows a time "in the current minute" that looks earlier than the planner step.

5. **Prompt rules (Hebrew, in `prompt.md` section "קביעת send_at").** The momentum paragraph is rewritten as two lists:
   - Answer `asap` when the client is active and waiting: the last message is the client's, sent within the last few minutes, and this message answers it; or this is the reply after verification of files the client just sent; or the client just agreed to start a fetch and this message says "starting now" (the `start_login` message).
   - Answer a time when: the client said they need a moment (looking for a document, will answer later, in a meeting) — give the room they asked for and schedule a gentle check; the message is a reminder (last message is the agent's); it is the first message to a new client or any proactive message; the client has been silent for more than ~15 minutes (then the existing "same day until 22:00 / next working morning" rules); the next message is the code check-in while waiting for a verification code (minutes ahead, as today).
   The keep-alive contract line in `prompt.ts` changes "send_at עתידי" to "send_at (מועד עתידי או asap)". The format line for `send_at` names `asap` as the second allowed form.

6. **Evals.** `evals/stages.ts` `send_at_future` check passes when `send_at === 'asap'` or the time is in the future. New optional expectation `send_asap: boolean` adds a `send_asap` check. Two cases added through the `add-eval-case` skill: an active client asking a question (expects `send_asap: true`) and a client saying they are looking for the document now (expects `send_asap: false`). The judge text in `generate_message.json` line 3 is updated.

## Risks / Trade-offs

- [The model over-uses `asap`, e.g. for reminders] → the prompt lists the forbidden cases explicitly, the eval case for "looking for it now" guards the main corner case, and the trace shows `asap` so misuse is visible. No code clamp by design.
- [A `asap` draft on a closed 24h window] → unchanged behaviour: a free-form draft is refused by the worker at send time, as it is today when the window closes before `send_at`; the prompt's rule that free-form text needs an open window still applies.
- [An `asap` reply on a review-mode instance looks "past due" immediately] → the admin sees the existing past-due approval modal ("will be sent immediately on approval"), which is the correct message for an immediate reply.
- [Older stored traces show only wall-clock times] → no migration needed; `asap` is just a new string value in step detail.

## Migration Plan

Deploy with the normal push-to-master flow. No DB change. Rollback = revert the commit; a draft already queued with delay 0 has already been sent or is held for review.
