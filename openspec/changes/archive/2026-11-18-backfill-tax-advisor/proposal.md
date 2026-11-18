## Why

The tax advisor link (change `client-tax-advisor-link`) is read only at the monday kickoff, so every declaration client enrolled before the board mapped its people column has no stored advisor. Asking the accountant to press the kickoff again on every row is not acceptable; an admin needs a one-press way to re-read the advisor for a whole agent without the accountant knowing or doing anything.

## What Changes

- A new admin-only action on the workspace Settings view's existing "בדיקה" (test) tab, shown only while an admin views the workspace as the accountant: "re-read tax advisors". One press re-reads the advisor cell of every client of the agent that remembers its monday row and stores the result the way the kickoff does (new person replaces, empty cell clears, unmapped board leaves the value alone).
- A new admin-only workspace route behind it, refused for the accountant's own session, that walks the agent's clients, fetches each remembered row from monday with the accountant's connection, resolves the advisor with the kickoff's own step, and reports counts (updated, cleared, unchanged, skipped, failed).
- Each client whose stored advisor changed gets an audit entry naming the real admin as the actor.
- No migration, no change to the kickoff, no accountant-facing surface, nothing written to monday.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `client-tax-advisor`: adds a requirement that an admin can re-read the advisor of every remembered row of an agent on demand, with the same outcomes per client as a re-fired kickoff. The capability is currently a delta in the unarchived change `client-tax-advisor-link` (`openspec/changes/client-tax-advisor-link/specs/client-tax-advisor/spec.md`); that change archives first, then this delta lands on top of it.
- `admin-test-client`: the admin-only test tab holds one more group, the advisor re-read action, next to the test-client form.

## Impact

- Server: `src/agents/declarationOfCapital/` gains a backfill module and one route in `router.ts`; reuses `resolveTaxAdvisor` (kickoff.ts), `fetchItemDetails` (shared/mondayData.ts), `clients.listForInstance`, `clients.setDeclarationEngagement`, `mondayOauthTokens.getByUserId`; `src/audit/audit.ts` gains one action name.
- Web: `web/src/components/TestClientForm.tsx` (or a sibling panel composed next to it in `web/src/agents/declarationOfCapital.tsx`), `web/src/api.ts`, `web/src/i18n.tsx`.
- Docs: `docs/pipeline.md` (one row for the new step), `docs/agents.md` (admin-only controls paragraph).
- External: monday API reads, one item fetch per remembered client plus one users lookup per distinct advisor; bounded by the agent's roster size.
