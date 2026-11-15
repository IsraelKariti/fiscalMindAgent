## Why

When a client asks something the agent cannot answer on its own (a question about the office's practice, an unusual document, a tax judgement the prompt's knowledge base does not cover), the agent today has two bad options: guess, or tell the client to "contact the tax advisor at the office" and drop the thread. Each client already carries the team member who handles them (`agent_fields.tax_advisor`, openspec `client-tax-advisor`), and that person can sign in as a staff viewer and drive the conversation. What is missing is a way for the agent to ask that person, for the person to answer inside the app, and for the agent to carry the answer back to the client.

## What Changes

- **A new planner tool `ask_team`.** In a `follow_up` answer the planner may call `ask_team(question, why)` once, together with its one WhatsApp message to the client ("I will check with the office and get back to you"). The code refuses the call when a question is already open for the client, when the answer is not a `follow_up`, or when the question is empty.
- **A team question record per client.** The question is stored with who it was sent to (the stored tax advisor; the accountant when the advisor is unmatched or missing), when, and later the answer, who answered and when. At most one question is open per client at a time.
- **An email to the team member.** The addressee gets one email naming the client, the question and the agent's reason, with a link to the client's page. It is recorded on the client's trace like the other platform emails.
- **A "Questions" tab on the client's page.** Next to the conversation and documents tabs, a questions tab lists the agent's questions as cards: the question, the reason, the client's quoted message when there is one, who it was sent to, the answer box while open, and the answer with the answerer's name and time once answered. The tab label shows a count while a question is open. The accountant, a staff viewer and an admin viewing as the accountant can answer. The client never sees this tab; it is not part of the WhatsApp thread.
- **Two ways to close a question.** The team member either types an answer for the agent to relay, or presses "I answered the client myself" with an optional note of what was said (for a phone call or a meeting). Both close the question, record an audit step, publish the client update, and run one planner cycle.
- **The planner relays or continues.** The planner prompt gains a TEAM QUESTIONS section listing the client's questions and how each was closed. The rules: relay a typed answer to the client in plain words; after a question handled outside the app, continue the collection without repeating the office's answer; never ask the same thing again while a question is open; an open question blocks only that one topic, the rest of the collection goes on, and a client whose words show the office already settled it is not told "still checking".
- **Sidebar visibility.** A client with an open question carries a small question badge in the sidebar list, and the sidebar shows a "questions for me" chip with the number of open questions addressed to the signed-in person; pressing it narrows the list to those clients. The chip is hidden when the number is zero.
- **Staff viewers may close questions.** The read-only gate lets a viewer close a question, by answer or as handled outside (the only new write a viewer may make).
- **Trace and docs.** The `ask_team` call gets its own tool step; the email and the closing get audit steps; `docs/pipeline.md` and `docs/agents.md` list the new steps; the planner evals get cases for asking and for relaying.

Not in this change: reminders to a team member who does not answer (the sidebar chip and the email are the only nudges), answering by email reply, more than one open question per client, and any change to the monday board.

## Capabilities

### New Capabilities
- `team-questions`: the agent asks the client's team member a question when it cannot answer the client itself; the question record, the email, the questions tab on the client's page, the sidebar badge and chip, the planner's rules for asking and relaying, and the trace steps.

### Modified Capabilities
- `accountant-staff-access`: "A viewer may drive a client's conversation" gains answering the agent's team questions as an allowed viewer write.
- `conversation-trace`: "Every accepted tool call is executed and recorded as its own step" gains the `ask_team` step; "Accountant notifications are recorded in full" gains the team-question email (which may go to a staff member's address, not only the accountant's).

## Impact

- **Planner**: `decisionTools.ts` (new tool), `decisionSchema.ts` (gate rules), `plan.ts` (apply step, prompt inputs), `prompt.ts` + `prompt.md` (TEAM QUESTIONS section and rules), `toolStepDetails.ts`, `tests/decisionTools.test.ts` shape test, evals cases.
- **Data**: migration 068 `team_questions` table; `src/db/queries/teamQuestions.ts`; `src/audit/audit.ts` actions `ask_team`, `team_question.closed`; `notifyAccountantCore.ts` generalised to a named recipient (kind `team_question`).
- **API**: `src/api/workspace.ts` client read returns the client's questions; new `POST /agents/:agentId/clients/:id/team-questions/:questionId/close`; roster rows carry the open question's addressee; `src/api/viewerAccess.ts` allow-list.
- **Web**: a new `questions` tab in `web/src/agents/declarationOfCapital.tsx` rendering `TeamQuestionsTab.tsx`, a tab-label count in `ClientView.tsx`; `Sidebar.tsx` badge + chip; `api.ts`, `i18n.tsx` (Hebrew + English), `styles.css`; `timelineRows.ts`/`stepSummary.ts` for the new step rows.
- **Docs**: `docs/pipeline.md` part D rows, `docs/agents.md` concepts, Notion feature page per `STYLE.md`.
- No change to monday, Twilio, or the WhatsApp templates.
