## Context

See proposal.md for motivation.

- `planFollowUp` (`plan.ts`) loads `history` with `emails.listForClient`, which returns only `status IN ('sent','received')`. That same array drives code rules: last inbound WhatsApp time, `inboundTexts` for evidence quotes, `confirmableMessageIds` for attestation.
- Every plan writes its reply as an `emails` row with `status='draft'`. A newer plan replaces the scheduled job; the old row stays as `draft` (in review mode: `review_status='superseded'`). A draft whose send time arrives unapproved becomes `status='held'`.
- So at the moment a plan runs, every outbound row with `status IN ('draft','held')` is a message the client never received. None of them is "about to be sent": the running plan will replace the schedule.
- `buildPrompt` (`prompt.ts`) joins fenced sections that share one random fence token; the thread section is last and ends with "Decide the next action now."

## Goals / Non-Goals

**Goals:**
- The model can see what it already drafted during a burst of client messages.
- Zero change to what counts as delivered for any code rule.

**Non-Goals:**
- No code gate that compares reply text to the document list (separate change).
- No change to the supersede / hold / review lifecycle.
- The drafts' stored `reasoning` is not shown to the model.
- No change to the workspace or admin UI.

## Decisions

**1. Separate block, not entries inside the thread.**
A new section `UNSENT DRAFTS`, placed directly before `MESSAGE THREAD`. Alternative: interleave drafts in the thread with an "unsent" tag. Rejected: the thread is the record of what the client saw, its `[#n]` numbering and the model's reading of "who spoke last" rely on that, and one missed tag would make the model believe the client read an offer. Timestamps on each draft still let the model place it between client messages.

**2. A new query; `history` is untouched.**
Add `emails.listUnsentDraftsForClient(clientId, after: Date | null, limit)`: `direction='outbound' AND status IN ('draft','held')`, `created_at > after` when `after` is given, newest `limit` rows, returned oldest first. `plan.ts` computes `after` as the latest `sent_at` among outbound rows in `history`. Alternative: widen `listForClient` and filter in callers. Rejected: every current caller relies on delivered-only, and a missed filter would break attestation.

**3. `buildPrompt` takes the drafts as a new optional last parameter** (default `[]`), so the evals call site and tests compile unchanged. An empty list yields an empty section string, which `buildPrompt` already filters out.

**4. Entry format.**
`[draft N] <created_at ISO> | via: <channel> | NOT DELIVERED (<replaced by a newer plan | held for review>)` then the body. "held for review" when `status='held'` or `review_status='pending'`; otherwise "replaced by a newer plan". Header line of the block, in English like the other fences: these were never delivered; the client has not read them. Body capped at 1,500 chars with a `[...truncated]` marker (same marker the documents section uses). Body passes through the existing fence-defanging sanitizer: a draft can echo client text, and the block must not be able to close a fence.

**5. Bounds: after last delivered outbound, max 5.**
Drafts older than the last delivered reply describe a state the delivered reply already replaced. Five covers a realistic burst; the observed case had six and the oldest adds nothing the document list does not already show.

**6. One short paragraph in `prompt.md`** near the thread-reading guidance: the block shows your own earlier drafts that were not delivered; use it to know what you already prepared and which list actions you already took; never assume the client saw, accepted or answered them; when the client's new message adds facts, handle all of them in this decision.

**7. Evals.** `DecideCase` gains optional `unsent_drafts` (body, created_at, optional held flag), mapped to `EmailRow`s and passed to `buildPrompt`. One new `generate_message` case reproduces the 2026-09-18 burst: last client message names two new pension funds; assert `added_instances` contains two instances on a pension anchor.

## Risks / Trade-offs

- [Model treats a draft as delivered] → separate block, explicit label on the block and on every entry, instruction in `prompt.md`, and the spec scenario on attestation is enforced in code, not by the model.
- [Model copies an old draft and repeats a stale offer] → instruction says drafts are context only; the eval case checks the reply still handles the newest message.
- [This does not fix the missed `added_instances` by itself] → accepted; the new eval case measures it, and a code gate can follow as its own change.
- [Prompt growth] → at most 5 × 1,500 chars.

## Migration Plan

No schema change. Deploy is a normal push. Rollback is a revert.
