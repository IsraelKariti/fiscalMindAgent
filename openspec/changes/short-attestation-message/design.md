## Context

- The closing summary is written by the planner model. Its content is governed by `prompt.md` action 3 ("אישור סופיות") and by the WhatsApp drafting rules that call the summary "the one long exception". The INTAKE STATUS block (`buildIntakeSection`, `prompt.ts`) tells the model when the next message must be the summary.
- The attestation gate (`validateAttestation` in `decisionSchema.ts`) and the evidence rules are code and stay untouched.
- Goal completion has two paths: the planner cycle (`completeGoalIfDone`, `plan.ts`) and the manual documents toggle (`onDocumentsChanged`, `router.ts`). Both email the accountant via `sendGoalCompleteEmail`; neither sends anything to the client. Once `goal_status` is `complete`, `setFutureEmail`, the send worker and the review approve route all refuse to act — so a closing message cannot be a normal scheduled draft.
- `sendWhatsAppTextAndRecord` (`src/twilio/sendAndRecord.ts`) sends a free-form WhatsApp text and stores it as a sent outbound row in `emails`; the tax-fetch progress messages already use it. The 24h window state comes from `getWaChannelState` (`plan.ts`).

## Goals / Non-Goals

**Goals:**
- A short summary whose only purpose is the completeness confirmation.
- One closing message after the goal completes, on both completion paths, without touching the goal-complete guards.

**Non-Goals:**
- Changing the attestation gate, the evidence rules, or when the summary is requested.
- Letting the model write the closing message, or sending a template when the window is closed.
- Changing the accountant notification email.

## Decisions

**D1 — Summary content is a prompt rule, not a code gate.** Rewrite action 3 in `prompt.md`: the summary is (1) a short thank-you, (2) the items the client said they do not have, one per line in plain words, (3) one explicit yes/no question on completeness. Say explicitly: do not list received or verified documents; a prior declaration kept at the office is not listed. Drop "the summary is the one long exception" from the length rules (the summary now follows the 2-4 sentence default plus the item lines) and keep "one request per message" valid for the summary too. The INTAKE STATUS line for the `allSettled` case says the next message is the short summary. Alternative considered: a code check that the summary names no approved document (string match on document names) — rejected: approved document names appear naturally in the client's "do not have" lines (e.g. a second bank), so the check would reject good messages. The eval case `dec_06` carries the behavior instead (`message_excludes` on the two received documents' names, `max_question_marks: 1`).

**D2 — The closing message is a fixed, code-authored text.** A new pure module `closingMessage.ts` exports `closingMessageText(client, accountantName)`: Hebrew, male first person like the persona, first name of the client, accountant display name resolved the same way the prompt resolves `accountant_name` (hebrew_name → name → email → 'המטפל בתיק'). Reason: the model answer that completes the goal carries no message by contract (goal_complete has null message fields), the review-mode gate reviews model drafts, and the send worker refuses to send once the goal is complete. A fixed text needs no review, no schedule and no gate change. Alternative considered: let the `goal_complete` answer carry `whatsapp_text` and schedule it before marking the goal complete — rejected: it needs a review-mode path, a worker guard exception and a marker against a second closing message on the post-send replan.

**D3 — Where it is sent.** New function `sendClosingMessage(client, now)` in `plan.ts`'s module tree (listed in `docs/pipeline.md` as its own junction): loads `getWaChannelState`; when `allowed && windowOpen` and the instance has a WhatsApp sender, calls `sendWhatsAppTextAndRecord` with reasoning "closing message"; otherwise logs and returns. Errors are caught and logged (the goal still completes). Called from `completeGoalIfDone` after `updateGoalStatus(.., 'complete')` and before the accountant email, and from `onDocumentsChanged` in `router.ts` at the same point. Records planner step `send_closing` (new label in `web/src/i18n.tsx`) on the planner path only; the manual path has no planner run. Sending after the status flip is deliberate: the window check is enough to decide, and a sent row stored after completion harms nothing (the worker never touches it, it is already `sent`).

**D4 — At most once.** Both paths run under the client lock and flip `goal_status` from `pending` to `complete` exactly once; the message is sent inside that flip, so it cannot repeat. A reopened goal (manual toggle back to pending) that completes again sends it again — intended, it is a new completion.

## Risks / Trade-offs

- [Model still recaps received documents despite the rule] → `dec_06` eval excludes the two received documents' names and caps the message to one question mark; re-run `generate_message` on the configured model before archiving.
- [Hebrew-only closing text for a client who writes in another language] → accepted; the model-written summary already adapted, the closing line is one sentence. Revisit if a real client writes in another language.
- [Window just closed between the confirmation and the planner run] → the planner's confirmation turn runs within seconds of the inbound message, so the window is open in practice; the manual path simply skips the message.
- [Twilio failure] → caught and logged; the row stays as a `draft` row (the helper's existing behavior), visible in the timeline, never re-sent.
