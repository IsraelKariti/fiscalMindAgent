## Context

See proposal.md for motivation. Observed today:

- `webhook/mondayKickoffRoute.ts` · `startClientForItem`: `isStartable` (goal open, paused, no messages) → `startConversation` (unpause + audit `client.kickoff_triggered`) → `preResolveFromForm` → `draftFirstEmail` (fire-and-forget `setFutureEmail` with a retry ladder) → monday status "בטיפול סוכן".
- `setFutureEmail` returns early when `client.paused`; `scheduleDraftMessage` always inserts the draft, enqueues the BullMQ job with the plan's delay and mirrors it in `scheduled_jobs`.
- Pausing (`pauseFutureEmail`) removes the queued job but keeps the draft + `scheduled_jobs` row. The timeline already renders that state (bubble with the text, "מושהה — מתוזמן ל־…", Resume). The boot resync skips paused clients.
- `resumeFutureEmail`: time still ahead → re-enqueue the same job id with the remaining delay; time passed (or nothing preserved) → `removeFutureEmail` + fresh plan.
- `queue/replanWorker.ts` runs `removeFutureEmail` then `setFutureEmail` on every inbound turn; for a paused client this drops the preserved draft and schedules nothing.
- `sendFutureEmailNow` already has the "job missing from Redis → add it with the same job id, no delay, stamp `scheduled_for = now`" branch.
- The admin review flow (048) has a past-due warning modal on its approve button (`admin-message-review` spec); it stays independent, and its modal is the pattern to copy.

## Goals / Non-Goals

**Goals:**
- The held state is byte-for-byte the state `pauseFutureEmail` leaves behind, so the timeline, the resync and the pause code need nothing new.
- Resume sends the text the accountant read, never a different one.
- Nothing changes on the monday board; no migration; no new routes.

**Non-Goals:**
- No per-instance toggle; the hold is unconditional for manual-kickoff agent types.
- No editing of the held text; no list badge; no notification to the accountant.
- The workspace resume of a never-contacted client **with no draft** (an imported client, or a kickoff whose drafting failed for good) keeps today's behaviour: it starts the conversation and the agent drafts and schedules normally.
- The admin review flow (048) is untouched.

## Decisions

1. **Hold is derived, not stored.** `setFutureEmail` treats a client as "held" when it is paused, its agent type is manual-kickoff, and it has no messages. In that case it does not return early but runs the planner with a `hold` hint. Alternative: an `agent_fields` marker or a column; rejected because the three existing facts already identify the state, and a marker would need clearing on every exit path.

2. **Hold mode in `scheduleDraftMessage`.** With `hold: true` it inserts the draft, upserts the `scheduled_jobs` row with the deterministic job id (`send_email:<clientId>:<emailId>`) and the planned time, and does **not** enqueue the job. The declaration-of-capital planner's scheduling step forwards the hint. Alternative: unpause → draft → re-pause under the lock; rejected because `paused=false` would be visible to the UI and to inbound handling for the LLM's duration.

3. **The kickoff route stops unpausing.** `startConversation` keeps its audit and the workspace publish but no longer calls `setPaused(false)`; the monday status sync stays as today. `isStartable` additionally requires no `scheduled_jobs` row and no `drafting_since` stamp, so a repeat fire while the draft exists or is being written is ignored. Alternative: a dedicated "held" audit action and monday label; rejected by the user (no monday changes, paused is enough).

4. **Late resume sends the preserved draft now.** In `resumeFutureEmail`, when a row exists and its time has passed and the job id parses, enqueue the same job id with no delay and stamp `scheduled_for = now` (the `sendFutureEmailNow` missing-job branch, extracted into a shared helper). The fresh-plan fallback stays only for "nothing preserved" or an unparseable / squatted job id. Alternative: keep the redraft and add a separate approve route; rejected because the accountant would read one text and another would go out, and the user wants the existing Resume button.

5. **The warning lives in the Resume click, client side.** In `Timeline.tsx` the Resume handler checks `nextScheduled.scheduledFor <= now` at click time; if so it opens the in-app `ConfirmModal` (Hebrew title/body: the planned time passed, the message will be sent immediately), and calls the existing pause toggle API only on confirm. No new API. The modal copy and the check mirror the admin review modal so both behave alike.

6. **Inbound while held re-drafts held.** `replanWorker` is unchanged: `removeFutureEmail` drops the held draft, and `setFutureEmail` (decision 1) drafts a new held one. Drafting failure leaves the client paused with no draft; the paused notice + Resume then start the conversation as today.

## Risks / Trade-offs

- [Every late resume now sends the old draft instead of redrafting] → a preserved draft only survives a pause when no reply arrived (the re-plan drops it otherwise), so the text is still current; the modal makes the immediate send explicit.
- [Kickoff-then-forget: the accountant triggers from monday and never opens the workspace] → the client stays paused forever; the board row already shows "בטיפול סוכן". Accepted by the user (paused is enough); a reminder is a later change if asked.
- [A resync or stray `setFutureEmail` call for a never-triggered imported client would draft a held message] → cost is one LLM call and a paused bubble; the import path never calls it today.
- [Kill switch / admin pause while held] → `adminCommsPaused` is checked before the hold path; a late resume's immediate send is swallowed by the existing worker guard like any send.

## Migration Plan

- Deploy backend + web together.
- Clients already running (unpaused, first draft scheduled) are unaffected. Clients enrolled paused with no draft behave as today.
- Rollback: redeploy the previous build; a held client is a paused client with a preserved draft, which the old Resume handles (restore or redraft).
