## Context

See proposal.md for the motivation. What exists today:

- `runOverdueScan` (`src/agents/declarationOfCapital/overdueScan.ts`) runs at 00:10 local time and at worker boot. For each client whose due date passed it calls `clients.markOverdueStopped` (sets `paused` and stamps `agent_fields.overdue_notified_at` + `overdue_stopped_at`), cancels the pending send, and emails the accountant.
- Resume clears `overdue_stopped_at` (`clearHandedOff`). A new due date clears both overdue markers.
- The send worker refuses to send for a paused client, so the notice cannot travel as an ordinary scheduled draft.
- `sendClosingMessage` (plan.ts) is the existing pattern for a fixed, code-written message that bypasses the planner, review and the send job. It sends free text only inside the 24h window.
- `sendAtGuard.ts` already knows the blocked days: Friday, Saturday, a chag and an erev chag (`isBlockedDay`, private today; `jewishHolidays.chagLabel`).
- The tax advisor is stored in `agent_fields.tax_advisor` (`StoredTaxAdvisor`: name, email or null, match). The monday kickoff refuses to start a client without an advisor email, so only hand-added clients lack one.
- Templates live in `wa_templates` with `purpose IN ('intro','reopen')` (migration 064). `splitTemplatesByPurpose` treats everything that is not `intro` as usable after first contact.
- Each new template is created by the owner in the Twilio Content Template Builder, approved by Meta, and then seeded by SID in a migration (064, 071, 072). Dev and prod share the Twilio account.

## Goals / Non-Goals

**Goals:**
- One notice per stop, at 09:00 local on a business day, with no stored send date to keep correct.
- At most one notice even with overlapping runs or a retry after failure.
- No LLM, no review hold, no change to the planner.

**Non-Goals:**
- No change to the length of the collection window or to who sets it.
- No notice for a client who declined (that flow has its own handling) or whose goal completed (the closing message covers it).
- No email copy of the notice to the client; the agent is WhatsApp-only.
- No accountant-facing setting to edit the text or turn the notice off.
- Forwarding the documents themselves: the accountant already has them in the workspace; the notice only tells the client.

## Decisions

### A daily 09:00 job decides, not a date stored at stop time
A second job scheduler `handoff-notice-daily` (`0 9 * * *`, `tz: ACCOUNTANT_TIMEZONE`) is added on the existing `overdue_scan` queue with job name `handoff_notice`; the worker dispatches on the job name. The job does nothing when today is a blocked day. Otherwise it lists the clients that are due and sends.

"The next business morning" then needs no arithmetic: the first 09:00 run on an allowed day after the stop is that morning. A missed run (worker down) or a blocked send (kill switch, admin pause) is picked up by the next run with no extra state.

Alternative considered: compute the send time at stop and enqueue a delayed BullMQ job per client. Rejected: the job must be cancelled on resume and on a new due date, and re-created after a failure, which is more state for the same result.

The job does not run at worker boot. A boot in the afternoon would send outside the morning. The next daily run covers it.

### Who is due: one SQL list, one claim
`clients.listHandoffNoticeDue(agentTypes, sinceIso)` returns clients of the agent type that are not deleted, `goal_status = 'pending'`, `paused = true`, carry `overdue_stopped_at >= sinceIso` (now minus 7 days), and carry no `handoff_notice_sent_at`. `declined_at` clients have no `overdue_stopped_at` (the overdue scan skips paused clients), so they are out without a special case.

The 7-day bound does two jobs: clients stopped long before the deploy never get a surprise message, and a notice that keeps failing stops being retried. 7 days is longer than the longest blocked stretch (about 4 days).

Before sending, `clients.claimHandoffNotice(id)` stamps `handoff_notice_sent_at` with a conditional UPDATE repeating the same WHERE; only the run that gets the row back sends. When the send throws, `clients.releaseHandoffNotice(id)` removes the stamp so the next business morning tries again. A Twilio error means the message was not accepted, so releasing does not risk a double send. The whole step runs under `withClientLock`, like the overdue scan.

Skips that happen before the claim (kill switch, `adminCommsPaused`, no sender, no phone, no template) leave no stamp.

### A new due date clears the marker, resume does not
`setDueDate` already removes the overdue markers; it also removes `handoff_notice_sent_at`. So a second stop sends a second notice. Resume keeps the marker: a resumed client is never stopped again by the same date, so the marker is harmless there.

### The message is always the template
The notice is sent with `sendWhatsAppTemplate` even when the 24h window is open. One text, approved once, the same for every client. The closing message's "free text or nothing" rule does not fit here, because a client who went silent for 30 days is almost always outside the window.

A new `sendWhatsAppTemplateAndRecord` in `src/twilio/sendAndRecord.ts` sends first and records after: send, insert the outbound row (body = rendered template text, `wa_content_sid`, `wa_content_variables`), mark sent, record the `wa.template_sent` audit event. The row makes the notice show on the timeline with no UI change. The order differs from the text variant on purpose: a refused send throws before any row exists, so a retry on a later morning leaves no dead draft behind (the emails queries have no delete, and the discard reasons are a closed list).

The template row is looked up by purpose (`handoff`) for the agent type, not by a hard-coded SID, so the SID lives only in the migration.

### Template purpose `handoff`
`WaTemplatePurpose` gains `handoff`; a migration widens the CHECK. `splitTemplatesByPurpose` drops `handoff` rows before splitting: they are neither offered nor listed as hidden (the planner has no reason to know they exist). Because they are dropped first, "no usable template" still names the missing `reopen` or `intro` purpose correctly. The gate rejects a `handoff` SID the same way it rejects any SID that is not in the offered list.

The admin register form accepts `handoff` so the owner can register the approved template by hand in a database before the seed migration lands.

### Advisor variables
A pure function `handoffNoticeAdvisor(client, accountant)` returns `{ name, email }`: the stored advisor when its email is a non-empty string, otherwise `accountantDisplayName(accountant)` and the accountant's `email`. The first-name variable uses the existing `clientFirstName`. A second pure function builds the three variables and the rendered body. Both live in a new `handoffNotice.ts` next to `closingMessage.ts`, with unit tests. The same file holds the send routine and the job loop with their dependencies passed in (`sendHandoffNoticeWith`, `runHandoffNoticeScanWith`); `handoffNoticeSend.ts` wires them to the database, Twilio and the client lock (`sendHandoffNotice`, `runHandoffNoticeScan`). The split keeps the tests free of Redis and Postgres imports, which would keep the test process open. Each is one named single-purpose function, listed in `docs/pipeline.md`.

### Blocked-day test is shared
`isBlockedDay` in `sendAtGuard.ts` is exported together with a small `isBlockedLocalDate(now, timeZone)` helper, so the job and the planner clamp cannot drift apart.

### Template text
The owner created this in the Twilio Content Template Builder on 2026-11-28 as `finish_conversation` (`HXf24253b8b72a3f92849eb34d05a28a1e`, Hebrew, category Utility, no buttons, 3 variables). Meta's approval was pending when the seed migration was written; until it is approved the provider refuses the send and the job retries on the next business morning:

```
שלום {{1}},
תקופת איסוף המסמכים להצהרת ההון כאן בוואטסאפ הסתיימה, והשיחה כאן נסגרה.
המסמכים שהתקבלו מועברים להמשך טיפול אצל יועץ/ת המס {{2}}.
לשאלות או להעברת מסמכים נוספים אפשר לפנות במייל {{3}}.
תודה רבה על שיתוף הפעולה!
```

The text does not end with a variable and has no two variables side by side (Meta rejects both).

## Risks / Trade-offs

- [Meta rejects or delays the template] → the code ships first and logs "no handoff template" each morning; clients stopped in the meantime get the notice once the template is seeded, if within 7 days. Nothing else depends on it.
- [Meta classes the text as Marketing instead of Utility] → the text states a status change of an ongoing service and has no call to action; if reclassified, it still sends, at a higher price per message.
- [A client stopped in the 7 days before the deploy gets the notice] → intended; it is the same message they would have got.
- [Clients of a deploy without the seed in one environment] → dev and prod share the Twilio account, so one seed migration serves both, as with the earlier templates.
- [The notice names an advisor whose email is wrong on monday] → out of scope; the stored advisor is already the source the accountant sees on the details tab.
- [Client replies to the notice and gets no answer] → by design (collection-window spec); the text says the conversation is closed and gives the email.

## Migration Plan

1. Deploy the code with the purpose migration (CHECK widened to include `handoff`). No behaviour change yet: no `handoff` template exists, so the morning job logs and sends nothing.
2. Owner creates `finish_conversation` in Twilio and waits for Meta approval.
3. Add the seed migration with the approved SID and the body copied verbatim; deploy.
4. Rollback: delete the `handoff` template row (admin template screen). The job then sends nothing. No data to restore.
