## Context

See proposal.md - Why.

Today two code paths resolve a client's national id in different ways:

- `taxFetch/providers.ts` `buildCredentials` (Altshuler, Harel): own credentials row → tax-authority credentials row → null. Called from `flow.ts` (`loadContextForProvider`, decides `available`) and `runner.ts` (the real login).
- `verifyDocument.ts` `clientIdOnFile`: tax-authority credentials row → `agent_fields.id_number` → fetch the CRM card once (openspec `declaration-kickoff`).

`client_portal_credentials` rows are written only by `shared/clientImportScan.ts` (Sheets/monday column mapping, tax-authority provider only). The capital-declaration kickoff writes `agent_fields.id_number` and never a credentials row. The prompt and decision plumbing for the fetch (offer, per-document consent, OTP relay, delivery) is complete and unchanged.

## Goals / Non-Goals

**Goals:**
- One id-resolution rule for Altshuler/Harel that both the availability check and the runner use.
- Zero data changes: no migration, no backfill, no UI.

**Non-Goals:**
- Fetching the CRM card at prompt time when neither store has an id (verification already does this lazily; the prompt path runs on every turn and must stay cheap).
- Changing the tax-authority provider (needs a user code that only the credentials row holds).
- Writing a `client_portal_credentials` row from the kickoff.

## Decisions

1. **Add a shared helper `clientIdNumber(client, preferredProvider)` in `taxFetch/`** returning the id and its source in the order: preferred provider's credentials row → tax-authority credentials row → `agent_fields.id_number` (trimmed, non-empty) → null. Altshuler and Harel `buildCredentials` call it and pair the id with `client.wa_phone`.
   - Alternative rejected: have the kickoff upsert a credentials row per provider. That duplicates the id into a second store, needs a backfill for existing clients, and the credentials table is documented as accountant-imported plaintext for the tax portal.
   - Alternative rejected: read `agent_fields.id_number` only in `flow.ts`. Then `available` could be true while `runner.ts` still fails with "no portal credentials on file". Both callers must share the rule.
2. **`verifyDocument.ts` `clientIdOnFile` keeps its lazy CRM fetch** but uses the helper for its first two steps, so precedence stays identical across verification and fetch (credentials → stored CRM id).
3. **Source tagging.** The helper returns `source: 'credentials' | 'monday_crm'` so `verifyDocument.ts` keeps showing the same label next to `id_matches_client`.

## Risks / Trade-offs

- [The stored CRM id could be stale or wrong, so a login is attempted with a bad id] → The site rejects the login; the existing `loginFailed` canned message and `failed` session state handle it, and verification already trusts the same id.
- [More clients become fetch-eligible at once] → Offers are prose-only and need explicit per-document consent; the runner's capacity guard is unchanged.

## Migration Plan

Code-only. Deploy normally; existing clients with `agent_fields.id_number` become eligible on their next turn. Rollback = revert the commit.
