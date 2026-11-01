## Context

See proposal.md — Why. Observed state of the code:

- A client may carry a hand-set collection due date in `agent_fields.due_date` ("YYYY-MM-DD"), set in the add-client modal or the client header (`PUT /clients/:id/due-date`, `clients.setDueDate`). Most clients (monday kickoff, import scan) never get one.
- `prompt.ts` · `buildDeadlineSection` puts the date and the days left in the planner prompt; `prompt.md` already tells the model to pace reminders toward the deadline and to ignore the factor when there is none.
- `overdueScan.ts` · `runOverdueScan` (BullMQ `overdue_scan`, 00:10 local + worker boot) lists pending, unpaused, non-test clients whose due date is before today (`clients.listOverdueForAgentTypes`), claims each with `markOverdueStopped` (paused + `overdue_notified_at` + `overdue_stopped_at`), pulls the pending send, emails the accountant (`sendOverdueEmail`). Resume clears `overdue_stopped_at`; a due-date edit clears both markers.
- Paused clients: inbound messages and files still land (`onInboundWhatsApp`), but `setFutureEmail` does not plan for a paused client, so nothing is sent.
- First contact is "a delivered outbound exists" (`emails.hasDeliveredOutbound`, status `sent`). Every first message is a planner draft sent by `sendEmailWorker` (`markSent` there); code-authored sends in `twilio/sendAndRecord.ts` (closing message, fetch notices) never come first.
- Per-instance admin settings live as columns on `agent_instances` (`tax_year`, `review_mode`, `admin_paused`, `logo_blob_key`) with a `POST /api/admin/agent-<thing>` route each and a card on `AgentPage.tsx`. `settings` JSONB holds client-import sources only.

## Goals / Non-Goals

**Goals:**
- One number per agent instance decides how long the agent chases; the stop itself reuses the due-date machinery unchanged.
- The automatic date is a normal due date: visible, editable, clearable, and overridable by the accountant.

**Non-Goals:**
- No new stop mechanism, no new client-facing wording, no prompt change (the existing deadline rule already paces toward the date).
- No backfill of clients contacted before the deploy.
- No accountant-side control of the window (admin-set, like the tax year).
- No change to the overdue email text.

## Decisions

1. **Window stored as a column `agent_instances.collection_window_days integer NOT NULL DEFAULT 14`** (migration 070), with a CHECK between 1 and 365.
   Alternative: a key in `settings` JSONB. Rejected: `settings` is the client-sources schema (strict Zod), and every other admin-owned knob is a column with its own route; a column also gives existing rows the default for free.

2. **Stamp the due date at first delivery, not compute it lazily.** A single named function `startCollectionWindow(client, instance, sentAt)` in `src/agents/declarationOfCapital/collectionWindow.ts` writes `agent_fields.due_date` only when `due_date` is absent. After it, the chip, the prompt section, the overdue scan and the resume/edit paths work unchanged.
   Alternative: have the scan and the prompt fall back to "first sent + N" when no date is set. Rejected: three readers (prompt, scan, UI chip) would each need the fallback, and an accountant could not clear the automatic date.

3. **Call it through an optional agent-type hook `onFirstContact(ctx, sentAt)`** on `AgentTypeDefinition`, invoked by `sendEmailWorker` right after a successful `markSent` when `hasDeliveredOutbound` was false before the send. The hook runs inside the existing client lock of the send job and before the replan, so the next planner run already sees the deadline.
   Alternative: call the declaration code directly from the worker. Rejected: the worker is generic; the pipeline doc lists one named function per junction, and a hook keeps the agent-specific write in the agent folder.

4. **Local date + N days by date arithmetic on the "YYYY-MM-DD" string** (`todayLocal`-style `Intl.DateTimeFormat('en-CA', { timeZone: env.ACCOUNTANT_TIMEZONE })` for the send time, then `Date.UTC(y, m, d + N)` formatted back). Avoids DST drift; the scan compares strings the same way.

5. **The accountant's hand-set date wins and stamping happens once.** `startCollectionWindow` is a conditional UPDATE: `WHERE agent_fields->>'due_date' IS NULL`. It is only called on the first delivered outbound, so a cleared date is never re-added. The existing `setDueDate` write path is untouched.

6. **Admin surface mirrors the tax year.** Agents payload adds `collectionWindowDays`; `POST /api/admin/agent-collection-window { agentInstanceId, days }` validates 1..365 with Zod, writes `agentInstances.setCollectionWindowDays`, logs `agent collection window set`. `AgentPage.tsx` gets a card with a number input and a save button, Hebrew strings in `i18n.tsx`. The activation modal is unchanged (default 14).

## Risks / Trade-offs

- [The scan excludes test clients and admin-paused clients, so a test client is never stopped] → unchanged from today and consistent with the admin-test-client spec; noted in docs.
- [The planner's deadline rule shortens intervals to "a day or two" near the date, which may read as pushy in the last days of a 14-day window] → the proactive-message rules still cap it to working hours; the user can tune `prompt.md` later if a live run shows it.
- [Clients contacted before the deploy keep no date] → stated in the spec; the accountant can set one by hand, or a backfill can be added as a follow-up.
- [Two sends racing on first contact] → the send job runs under the client lock, and the UPDATE is conditional on `due_date` being absent, so the second call is a no-op.

## Migration Plan

1. Pull, `npm run db:migrate` locally (070). Existing instances get 14.
2. Deploy; production runs 070 with its deploy flow (production still needs 062-069 as well).
3. Rollback: dropping the column is safe; stamped due dates stay as ordinary due dates.
