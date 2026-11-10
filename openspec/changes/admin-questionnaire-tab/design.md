## Context

See proposal.md — Why. Current state that shapes the approach:

- The answers already live on the client record as `agent_fields.form_answers`, an array of `{question, answer}` written at kickoff by `storableFormAnswers` (`src/agents/declarationOfCapital/kickoff.ts`) and by the admin test form (`testClient.ts`). Both sanitize at write time and drop blank answers. `toWorkspaceClient` (`src/api/workspaceSerialize.ts`) passes `agent_fields` through untouched, so the browser already receives the pairs on every client load — only the web type (`ClientAgentFields` in `web/src/api.ts`) does not declare the key.
- Client tabs are declared per agent type (`clientTabs` in `web/src/agents/declarationOfCapital.tsx`, type `ClientTab` in `web/src/agents/types.ts`) and rendered by the generic `ClientView`, which keeps a per-client last-viewed tab in memory and already falls back to the first tab when the remembered id is not in the tab list.
- The admin view-as state reaches `Workspace` as `impersonatingEmail`; `Settings` turns it into the admin-only "בדיקה" tab (`client-tab-admin` class + `admin-chip` marker, openspec `admin-test-client`). `ClientView` does not receive it today.

## Goals / Non-Goals

**Goals:**
- Reuse the existing admin-only tab convention (same class, chip and tooltip strings) so the two admin tabs look alike.
- Zero server change: the tab is a pure read of data the client view already holds.

**Non-Goals:**
- Showing unanswered (blank) questions — they are not stored, by design of the intake.
- Linking to the monday form item, editing answers, or re-fetching them from monday.
- Showing how each answer was mapped onto the checklist (that is the `form_intake` audit / trace, already visible elsewhere).
- Any change to prompts, the planner, or the intake pre-resolution.

## Decisions

1. **Gate the tab in the generic `ClientView` with an `adminOnly` flag on `ClientTab`, not inside the agent's render function.**
   `ClientView` receives a new `admin` boolean (Workspace passes `Boolean(impersonatingEmail)`), filters out `adminOnly` tabs when `admin` is false or `viewer` is true, and renders the admin-only button with `client-tab-admin` + the `admin-chip` span, exactly like `Settings`. The filtered list is what the remembered-tab fallback checks, so a remembered "questionnaire" outside view-as lands on Conversation with no extra code.
   *Alternative:* let the tab render an empty pane when not admin — rejected, the tab button itself must not appear for the accountant.

2. **Expose `admin` in `ClientTabContext` too.** Cheap, and keeps the door open for other admin-only surfaces inside existing tabs without a second plumbing change.

3. **Render from `ctx.client.agent_fields.form_answers` with a defensive filter.** The web type declares `form_answers?: Array<{question: string; answer: string}>`; the card component still filters out malformed entries (non-object, missing strings, blank answer) the way `buildFormAnswersSection` does server-side, so an old or hand-edited row cannot break the tab.
   *Alternative:* a new `GET .../clients/:id/questionnaire` route — rejected, the data is already on the client payload and a route would add an admin gate to maintain for nothing.

4. **Plain-text rendering.** The answer goes into a `<p>` (or `<pre>`-styled block) with `white-space: pre-wrap`; React escapes it, no markdown pane, no link detection. Matches the spec's "looks like markup" scenario and the project's rule that client-typed text is untrusted.

5. **Cards, not a table.** One `.questionnaire-card` per pair (question as a small heading, answer below), stacked in a `panel-stack` pane like the Details tab, RTL as the rest of the workspace. Follows the repo's card-over-table preference.

## Risks / Trade-offs

- [The accountant could still read the pairs from the raw API payload] → Already true today (`agent_fields` is on every client response); the tab adds no new exposure. Hiding it from the accountant is a UI-clarity decision, consistent with the test tab, not a security boundary.
- [Clients enrolled before `form_answers` existed show the empty state, which may look like "no form was filled"] → The empty-state text says "no questionnaire is stored", not "none was filled", and notes that blank answers are never kept.
- [Very long answers (up to 1500 chars after sanitizing)] → `pre-wrap` + the pane's normal scrolling; no truncation needed.

## Migration Plan

Deploy the web bundle; nothing else. Rollback is a redeploy of the previous bundle. No data or schema step.
