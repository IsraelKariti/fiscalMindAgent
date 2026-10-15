## Context

See proposal.md - Why. Today the pool is `listOwnedNumbers()` minus the local `wa_senders` rows (`src/api/waAdmin.ts`, GET `/api/admin/wa-numbers/orphaned`). The friendly name already carries ownership on two of three paths: purchase names the number `fiscalmind <type> <instanceId>` (`provisionWhatsAppNumber`), unassign and account deletion rename to `fiscalmind pool` (`markNumberAsPooled`). Assignment from the pool (`adminUpsertWaSender`) claims the webhook and logo via `claimSender` but never renames. The same owned-numbers list feeds `WaPoolModal` (pick) and the Settings orphaned-numbers section (release).

## Goals / Non-Goals

**Goals:**
- One shared ownership signal across environments that needs no shared database: the Twilio friendly name.
- Guard every path that can take a number away from another environment: pool pick, manual assignment, orphaned release.

**Non-Goals:**
- A shared registry or cross-environment API call. The Twilio name is enough and already half-used.
- Changing webhook or logo behavior on assignment (specified elsewhere, unchanged).
- Protecting against an admin renaming numbers in the Twilio console.

## Decisions

- **Ownership label is parsed, not matched against `fiscalmind pool`.** A new pure module `src/twilio/numberOwnership.ts` exports `ownerLabel(agentType, instanceId)` and `parseOwnerLabel(friendlyName)` returning `{ agentType, instanceId }` or null (null for `fiscalmind pool`, the phone number, or anything else). Pure so it gets a `tests/numberOwnership.test.ts` like `senderProfile.test.ts`. Alternative considered: "anything not `fiscalmind pool` is taken", which would block legacy numbers whose name is the phone number.
- **"Elsewhere" = label parses AND the instance id is not a row of local `agent_instances`.** Instance ids are UUIDs, unique across environments. Checking the local table (not `wa_senders`) also tolerates a stale label left by a failed best-effort rename in this environment: that id exists locally, so the number stays free. Alternative: compare against local `wa_senders` only; a stale local label would then wrongly lock the number.
- **Flag instead of hide.** The list endpoint returns every unassigned owned number with `claimedElsewhere: boolean` (and the parsed `owner` for display); the UI greys the row and drops the button. The admin sees why a number is unavailable instead of wondering. Alternative: filter server-side; simpler but hides the billing line the Settings section exists to show.
- **Server-side refusal on assign and release** (409, message: in use in another environment) computed with the same helper in `adminUpsertWaSender` (before `claimSender`, so the webhook is never touched) and `adminReleaseOrphanedWaNumber`. The UI guard alone is not enough: the manual form accepts any number.
- **Rename on assign is best-effort and runs after `claimSender` and the DB upsert succeed**, as `markNumberAsPooled` does: a new `markNumberAsOwned(phoneNumber, label)` in `provision.ts` sharing one implementation with `markNumberAsPooled` (look up the owned number, update `friendlyName`, swallow and log). A rename failure must not fail an assignment whose webhook is already claimed.
- **Owned-number lookup for the guards** reuses `listOwnedNumbers()` (one Twilio list call) on assign/release; the number may not be owned at all (external number), so no label and not elsewhere.

## Risks / Trade-offs

- [Twilio list call added to assign and release] → both are rare admin actions; a Twilio failure there returns the existing 502 paths.
- [An admin renames a number in the Twilio console] → the label is advisory; the worst case is today's behavior (number offered), not a new failure.
- [Two environments pick the same free number at the same time] → not addressed; last claim wins, as today.
- [Existing prod number already carries the right label] → nothing to migrate; the local pool flags it as soon as the endpoint ships.

## Migration Plan

No migration. Deploy backend and web together (the UI reads the new flag; the old UI ignores it). Rollback = revert; the renamed friendly names are harmless to the old code.
