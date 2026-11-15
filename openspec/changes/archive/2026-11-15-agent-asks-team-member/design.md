## Context

See proposal.md for the motivation. What the design builds on:

- The planner answers with flat tool calls (`decisionTools.ts`, openspec `planner-answer-tools`): every parameter required, never nullable, never an object. `assembleDecision` turns calls into the raw form and `normalizeDecision` holds every business rule. `planFollowUp` runs the accepted calls in a fixed order and records one step per call (`recordToolStep`).
- The client's team member is `agent_fields.tax_advisor` (`taxAdvisor.ts`: name, email, match accountant | staff | none). Staff members sign in as viewers (`resolveStaffViewer`); the read-only gate is the pure `viewerMayRequest` in `viewerAccess.ts`.
- Platform emails to the accountant go through `sendToAccountantWith` (recipient = the owner's sign-in email, recorded as an `email.accountant_sent` trace step with a `kind`).
- The conversation tab is `Timeline` inside the agent's `clientTabs` (`web/src/agents/declarationOfCapital.tsx`); the client read is `GET /agents/:agentId/clients/:id` (client, nextScheduled, documents) and the roster is `GET /agents/:agentId/clients`; both refresh on the SSE tick published by `publishClientUpdated` / `publishInstanceClientsUpdated`.
- The sidebar already computes "me" (`impersonatingEmail ?? userEmail`) and narrows by `isAssignedTo` (openspec `my-clients-filter`).
- The system prompt is static (`planner-prompt-caching`): per-request facts go in fenced input sections built by `prompt.ts` (`buildUnsentDraftsSection` is the model to copy).

## Goals / Non-Goals

**Goals:**
- One open question per client, stored in its own table, answered in the app, relayed by the next planner cycle.
- No new state machine on the client: the client's status, dot and handed-off logic stay as they are.
- Everything a viewer needs (questions tab, answer, badge, chip) works on both sign-in surfaces with the one new write route.

**Non-Goals:**
- Reminders to a silent team member, multiple open questions, answering by email reply, a free chat between the agent and the team (the question/answer pair is the whole exchange).
- Marking a question "relayed": the transcript already shows what the client was told, and the planner reads it.

## Decisions

**1. A table `team_questions`, not a key in `agent_fields`.**
Columns: `id`, `client_id`, `agent_instance_id`, `question`, `reason`, `asked_at`, `to_email`, `to_name`, `to_match` (`accountant | staff`), `closed_how` (`answered | handled_outside`, null while open), `closed_text` (the answer, or the optional note; null allowed only for `handled_outside`), `closed_at`, `closed_by` (users.id, null), `closed_by_name` (snapshot, for the card and the audit), `evidence_message_id` (the inbound the question rests on, nullable). A check constraint ties `closed_how`, `closed_at` and `closed_text` together. Partial unique index on `(client_id) WHERE closed_at IS NULL` enforces "one open question per client" in the database, so the gate's check and a race between two cycles both end in one row. `agent_fields` was rejected: a list that grows, needs locking, and must be joined for the roster count anyway.

**2. `ask_team` is a companion call of a `follow_up` answer, not a new decision value.**
The holding message to the client is still the answer's one `send_*` call (the continuity rule of the prompt stays true: every follow_up schedules exactly one message). Parameters: `question`, `why`, `evidence_message_id` (`''` when none). `assembleDecision` enforces "at most one ask_team" and `normalizeDecision` enforces: decision is `follow_up`, question non-blank, no open question in the context (new `DecisionContext.openTeamQuestion: { question, askedAt } | null`, filled by `buildDecisionContext` from the loaded rows). A rejected ask returns the usual corrective retry text. A new decision value was rejected because it would force a second code path for the message and break the one-message invariant.

**3. Apply order: conclude → ask_team → send message.**
`planFollowUp` calls a new `applyAskTeam(run, decision)` after `recordConclude` and before `scheduleReply`: insert the row (addressee resolved by `teamQuestionAddressee(client, accountant)` in a new `teamQuestions.ts` module: advisor with match accountant/staff → that person, else the accountant's sign-in email and display name), record the `ask_team` step (question, reason, addressee, question id), then fire-and-forget the email. The row is inserted before the holding message is scheduled, so a crash between the two leaves an open question the team can still see, rather than a client promised a check nobody received.

**4. The email reuses the accountant-notification path with an explicit recipient.**
`sendToAccountantWith` gains an optional `to: { email, name }` in its args (default: the owner, as today); `AccountantEmailKind` gains `team_question`. The audit action stays `email.accountant_sent` / `email.accountant_failed` so the trace glyph, modal and delivery-status lookup work unchanged (the spec's "Accountant notifications" requirement is widened to "accountant or team member"). The body: the client's name, the question, the reason, a line "answer it on the client's questions tab", the app link. No reply-to parsing.

**5. Prompt: a TEAM QUESTIONS section plus three rules.**
`buildTeamQuestionsSection(token, questions)` renders the last five questions newest first (question, reason, addressee name, asked time, and "open" / the answer with the answerer's name and time / "<name> answered the client directly" with the time and the note), through `sanitizeUntrusted` like drafts. `prompt.md` gets: (a) in the hard-boundary paragraph, "ask the team with `ask_team` and tell the client you will check" replaces "refer the client to the office's tax advisor"; (b) a "פעולה: שאלה לצוות" block saying when to ask and when not, that the message of that answer is a short holding note with `send_at: asap`, and that an open question is never re-asked; (c) in the TEAM QUESTIONS explanation: a typed answer is office knowledge to relay in plain words (the transcript shows whether it was relayed already); after "answered directly" the office's answer is not repeated and the collection continues; an open question blocks only re-asking and answering that one topic, everything else goes on; "still checking" is said only when the client asks about the open topic again, never when the client's words show the office already settled it. The section is omitted when the client has no questions, so prompts of other clients are byte-identical to today (cache-friendly).

**6. The close route runs one planner cycle under the client lock.**
`POST /agents/:agentId/clients/:id/team-questions/:questionId/close` with `{ how: 'answered' | 'handled_outside', text }`: load the client via `clientScope(req)`, load the question, refuse (404) when it belongs to another client, (409) when already closed, (400) when `how` is `answered` and the text is blank (for `handled_outside` the text is an optional note); store with `closed_by = req.realUserId` and the display name resolved from the users row (`hebrew_name` → `name` → email); `recordAudit('team_question.closed', actor user, detail: how, text length, name)`; `publishClientUpdated`; then `withClientLock(clientId, () => setFutureEmail(clientId))` fire-and-forget as the redraft route does (the drafting stamp shows "drafting…" in the timeline). One route for both ways keeps the viewer allow-list to one path and the audit to one action. `setFutureEmail` already returns quietly for paused, completed and admin-paused clients, which gives the "paused" and "completed/declined" requirements for free. The pending scheduled send is not cancelled first: the holding note was `asap` and is long gone; if a later chase is queued, the new cycle's `scheduleDraftMessage` replaces it as any re-plan does.

**7. Reads: questions ride on the client read; the roster carries only the open one.**
`GET /clients/:id` adds `teamQuestions: TeamQuestion[]` (all, newest first). `GET /clients` attaches `openTeamQuestion: { toEmail, toName, askedAt } | null` per row with one `listOpenByClientIds` query, in the same place `attachRosterCost` runs (for every viewer, not only view-as). The sidebar needs only the addressee email to count "for me"; the badge needs only non-null.

**8. UI placement: a tab of its own.**
A new entry `{ id: 'questions', labelKey: 'tabQuestions' }` in the agent's `clientTabs` (after documents) renders `TeamQuestionsTab.tsx`. `ClientTab` gains an optional `badge?: (ctx) => number | null`, and `ClientView` renders the number as a small chip on the tab button (the admin-only chip shows how); the questions tab returns the open count. The tab is always present (the tab list is static per agent type), with an empty-state line when there are no questions. Cards per `STYLE.md` sense: question in large text, meta line small, the client's quoted message (looked up in `ctx.emails` by `evidence_message_id`) as a pressable quote that calls `ctx.focusMessage(id)`, the same hand-off the documents card uses to focus a chat message; answer box a textarea with one "send answer" button, disabled while blank or sending, and a second, quieter button "I answered the client myself" that reveals an optional note field and a confirm button; errors inline (no browser dialogs). A closed card shows either the answer or "answered the client directly" with the note. `ctx.readOnly` does not hide the controls: viewers may close questions. The monday object renders the same `ClientView`, so nothing extra there. A panel inside the conversation tab was rejected: it crowds the chat's scroll box and the owner prefers the questions in their own place.

**9. Sidebar chip and badge.**
`Sidebar` gets `questionsForMeCount = clients.filter(c => c.openTeamQuestion?.toEmail equals meEmail).length` and a `forMe` toggle state, rendered as a chip next to the "my clients only" checkbox when the count is positive; `baseClients` applies the chip's narrowing after the my-clients narrowing (both can be on). The row badge is a small "?" glyph after the name with the hover text; the test-client badge shows how such a chip is done.

**10. Trace surfaces.**
`stepSummary.ts` / `stepGlyph.ts`: `ask_team` joins the tool-step list (glyph: the question-mark glyph; rows: question, reason, addressee); `team_question.closed` gets a row set (the way, the closer, text length). `docs/pipeline.md` part D gains three rows (gate rule, apply step, email); `docs/agents.md` Concepts gains a "Team questions" paragraph.

**Alternatives rejected:** a question in the WhatsApp thread as an internal note (would leak into the transcript the model sends); a Notion/monday task for the question (the team already works in the app and monday has no per-client thread); a per-question SSE channel (the client tick is enough).

## Risks / Trade-offs

- [The model over-asks] → the prompt lists the three cases and the exclusions, the gate forbids a second open question, and the planner evals get a "must not ask" case next to the "must ask" case.
- [A question nobody answers leaves the client silent forever] → the client's holding note is sent at once; the chip and the badge show the open question on every sign-in; a client who writes gets "still checking". Reminders are a follow-up change if this proves insufficient.
- [The holding note goes out but the row insert failed] → the insert runs first (decision 3); if the insert fails the cycle fails before any message, and the retry cycle asks again.
- [Two closings race] → the update is `WHERE closed_at IS NULL` and returns 0 rows for the loser, mapped to 409.
- [The team member answers the client by phone and never closes the card] → the client's next messages are handled normally (an open question blocks only its own topic), the badge and chip keep pointing at the card, and the "answered the client myself" button makes closing a one-press act.
- [Prompt cache] → the new section is omitted for clients without questions, so nothing changes for them; for clients with questions it sits after UNSENT DRAFTS and before VERIFICATION RESULTS.
- [Viewer gate widened] → one more POST path in `CONVERSATION_FLOW_ROUTE`, covered by `tests/viewerAccess.test.ts`.

## Migration Plan

1. Migration `068_team_questions.sql` (table + check constraint + partial unique index + index on `(agent_instance_id) WHERE closed_at IS NULL` for the roster count). Run `npm run db:migrate` locally; production applies it in the deploy flow.
2. Code ships in one deploy; no backfill. Clients without rows behave exactly as today.
3. Rollback: revert the code; the table can stay (nothing reads it).
