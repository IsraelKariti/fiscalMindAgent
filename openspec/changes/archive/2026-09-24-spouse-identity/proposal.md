## Why

A declaration of capital covers the household: the client's own assets and the spouse's (the catalog's pension row already says "including the spouse's funds"). But the client record knows one person only — one name and one national id — so every document the spouse owns fails the identity checks (`subject`, `id_matches_client`) and is rejected, as happened for client "ניב" with his wife's pension report (printed "מיכל תמיר", id ••••821, compared against ••••448). The questionnaire even says the client is married ("סטטוס משפחתי: נשוי/אה") and names the wife in the answers, and the system ignores it.

## What Changes

- The client record gains a **spouse on file**: at most one person, with a name and a national id, each of which may still be unknown, plus where each came from. The record also keeps the client's marital status when the questionnaire states it.
- **Sources of the spouse**, in trust order: cells of the submitted questionnaire or the linked CRM card whose title names the spouse (name / id) and the marital-status cell, read deterministically at kickoff like the client's own id today; then **documents** — when a verified document prints a checksum-valid id that is not the client's and no spouse id is on file yet, that id (and the printed name) becomes the spouse's. A questionnaire/CRM value always wins over a document-inferred one.
- **One spouse, enforced by code**: the verification gate accepts a printed id when it is the client's or the spouse's. A printed id that is neither — a third person — fails a new check `id_matches_spouse`, and so does any foreign id when the questionnaire says the client is not married. Name-only documents pass the `subject` check when the printed name loosely matches the client or the spouse on file.
- The client's own id rule stops taking a spouse-titled cell ("ת"ז בן/בת זוג") as the client's id.
- **The planner knows**: a fenced `CLIENT IDENTITY` prompt block states the marital status and the spouse on file (name; whether an id is known — never the number itself), and the prompt tells the agent that the spouse's assets belong to the declaration, that instance names carry the owner when it is the spouse, and that a file is tied to the spouse's item by the holder printed on it.
- The workspace documents card shows the spouse on file in one line; the trace shows the new check with a Hebrew label, and adopting a spouse from a document leaves an audit event with the masked id.

## Capabilities

### New Capabilities
- `spouse-identity`: the one-spouse record on a client — what it holds, where it may come from (questionnaire/CRM cells, verified documents), the precedence between sources, how document verification treats a printed id or name against client + spouse (including the third-person and not-married failures), what the planner is told, and where the workspace shows it.

### Modified Capabilities
- `declaration-kickoff`: the kickoff (and refresh) also reads the spouse's name, the spouse's id and the marital status from the questionnaire item and the CRM card; the client-id recognition rule excludes spouse-titled cells.
- `code-gates`: `verify_extraction` reports the reshaped `subject` and `id_matches_client` checks (expected values name client or spouse) and the new `id_matches_spouse` check.

## Impact

- `src/agents/declarationOfCapital/crmIdentity.ts` (spouse / marital-status cell recognition, client-id exclusion), `kickoff.ts` (store at enrollment and refresh), `src/db/queries/clients.ts` (`setDeclarationEngagement` spouse / marital fields in `agent_fields`).
- `verifyChecks.ts` (identity checks against client + spouse, adoption proposal), `verifyDocument.ts` (re-read the spouse before each verification, persist an adopted spouse, audit `client.spouse_inferred`), `taxFetch/clientId.ts` untouched (portal logins stay the client's own id).
- `prompt.ts` / `prompt.md` (`CLIENT IDENTITY` block + owner rules), `evals/stages.ts` (spouse in the extraction judge), tests (`verifyChecks`, `kickoffIdNumber`, new spouse tests).
- `web/src/i18n.tsx` (check label), the capital documents tab (spouse line), `docs/agents.md`.
- No migration: everything lives in `clients.agent_fields` (`spouse`, `marital_status`).
