## Context

See proposal.md — Why. Observed state:

- Fetch providers (`taxFetch/providers.ts`) match a checklist row to a document type by a regex on the row's **name** (`matchesRequiredDocument`: company word + פנסיה/גמל or השתלמות). `loadContextForProvider` returns null when no row matches, so the prompt gets no DOCUMENT FETCH block and the `tax_fetch` tool is not offered.
- The questionnaire mapping (`formIntakeCall.ts`) is told to make "one general instance" when the client did not name the fund's details, so rows like "אישור יתרת קרן פנסיה ליום 31.12.2025 — קרן פנסיה" are a normal outcome.
- The institutions table (`institutionsTable.ts`, `identifyInstitution`) already recognises every fetch company (harel, migdal, phoenix, menora_mivtachim, meitav, altshuler_shaham) and `companySplit.ts` already renames a no-company row to "<name> — <company>" when files arrive. The split's DB write (`clientDocuments.splitByCompany`) renames a live head in one transaction and reports a head that raced out of a live status as skipped.
- The planner's checklist changes are flat tools gated by `decisionTools.ts` / `decisionSchema.ts` and executed in `plan.ts` with one step per call (`conversation-trace`).

## Goals / Non-Goals

**Goals:**
- A no-company row gets its company from the client's words through the normal tool + gate + step path, with no new DB shape.
- The agent knows, from the prompt alone, which sites a company answer would unlock for this client, so its reply can offer the fetch in prose in the same turn.
- The rename is byte-compatible with the split's naming, so the employer split, company comparison and fetch regexes work unchanged.

**Non-Goals:**
- Changing the questionnaire to ask the company (the form is already submitted when this runs; may come later).
- Offering or starting the fetch in the same planner run as the rename (the fetch block is loaded at run start; the next run has it).
- Renaming rows that already name a company (correcting a wrong company is out of scope; the gate refuses it).
- Any change to the fetch providers, their regexes or the site flows.

## Decisions

1. **A dedicated `set_company` tool, not `retire_document` + `add_instance`.** Retire+add would change the row id, lose the row's description/paper/files and spend two evidence-backed calls on a name change. One tool with one gate keeps the row and records the fact in one step. Alternative rejected: prompt-only rule telling the model to add a named instance and retire the old one.

2. **Rename format "<current name> — <company>" with the split's separator.** `companySplit.employerBaseName` parses the trailing " — " parts, and the provider regexes only need the company word somewhere in the name. The label is `institutionLabelHe(key)` when `identifyInstitution(companyText)` finds a key, else the client's text (whitespace-collapsed, ≤ 60 chars). Alternative rejected: replacing the questionnaire's "— קרן פנסיה" suffix — it is the client's holding label and harmless.

3. **Prompt line computed in code, per row.** In `prompt.ts` the row line gets `חברה: לא ידועה — שאל את הלקוח ... ` when `isInstitutionBound(type) && status === 'pending' && identifyInstitution(doc.name) === null`. The site list is computed in `taxFetch/flow.ts` by a new pure-ish helper `sitesForUnnamedRow(spec[], client, waState, doc)`: for each provider with `buildCredentials(client) !== null` and `waState.allowed`, test `spec.documents.some(t => t.matchesRequiredDocument({ name: `${doc.name} — ${spec.siteNameHe}` }))`. Reusing the real matcher with the hypothetical name guarantees the list equals what the next run will actually offer. Credentials are resolved once per run (memoised per provider), not per row.

4. **Gate checks in `decisionSchema.ts` (`validateSetCompany`)**, reported as `set_company_row_allows`, `business_rules` (existing evidence rule), `set_company_in_quote` (normalised company text ⊂ normalised quote), `set_company_recognised` (informational). The normalised decision carries `setCompanies: { documentId, companyText, companyKey | null, newName, evidence }[]`.

5. **Execution order:** `set_company` runs after `resolve_document` and before `add_instance` in the checklist-changes group, so a sibling added in the same answer ("גם במיטב") is created next to the renamed head. The write is a small dedicated `clientDocuments.setCompanyName` (UPDATE … WHERE status = 'pending'), not the split's write: the split renames claimed and collected heads too, and the spec allows only a pending row. Audit `document.company_set` (actor agent) with old/new name, company key, evidence. After the write `run.documents` is reloaded and `publishClientUpdated` fires, as the split does.

8. **Altshuler pension matcher tightened (found by the site-list test).** The Altshuler `pension_annual` matcher accepted any row naming Altshuler that is not a study fund, so a bank or insurance row with "— אלטשולר שחם" appended would have listed Altshuler as a fetch site (and matched the provider after the rename). It now also requires פנסיה / גמל in the name, like Harel, Phoenix, Migdal and Menora. Every Altshuler pension row the app creates carries one of those words (catalog names, split names), so no existing row stops matching.

6. **Prompt rule (prompt.md):** one paragraph under the document-request rules: when a row says the company is unknown, ask which company in the same message as the document request (one question); if the client names a listed site, say the document can be pulled from the site and ask whether to go ahead, without asking for an upload; `set_company` with the quote; several companies → first on the row, rest `add_instance`; "don't know" → ask for the upload, never ask the company again. The existing "offers are prose-only" rule stays — the `tax_fetch` tool only appears with the block.

7. **Eval case** in `evals/cases/planner.json`: a planner state with the no-company pension row and the client message "הפנסיה שלי במגדל"; asserts a `set_company` call on that row and that the message mentions the Migdal site (question_excludes: no upload request). A second case: "לא יודעת" → no `set_company`, message asks for the document.

## Risks / Trade-offs

- [The model sets a company from a guess, not the client's words] → `set_company_in_quote` requires the company text inside a verbatim quote of an inbound message; the gate rejects the answer otherwise.
- [Client names a company in a form the table does not know ("מגדל מקפת")] → `identifyInstitution` already matches aliases; an unknown form still renames with the client's text, and the Migdal regex (`מגדל|מקפת`) still matches; the audit says "not in table" so the owner can add an alias.
- [Rename happens but the id is missing, so the promised fetch never appears] → the prompt lists only sites the client can use now (credentials resolvable, WhatsApp allowed); without any, the model offers nothing and asks for the upload.
- [Two messages: the rename turn asks "shall I pull it?", the next run must agree] → the next run's block is in state `none` with `client_agreed` allowed, so one client "yes" moves straight to the agreed state; no extra message.
- [Prompt size] → one short line per no-company row; most clients have zero to three.

## Migration Plan

No migration, no env var. Deploy as usual (push to master → sandbox; `deploy.yml` → prod). Rollback: revert the commit; renamed rows keep their new names, which are valid names today. Existing clients with no-company rows (the production client above) get the note on their next planner run.
