## Context

See proposal.md — Why. Today the identity of a client is three things: `clients.name`, the id on file (`taxFetch/clientId.ts`: portal credentials, then `agent_fields.id_number` from the CRM card via `crmIdentity.ts`), and nothing else. `verifyChecks.runChecks` is a pure function that gets `clientName` + `credentialIdNumber` in its `CheckContext` and decides `subject` / `id_checksum` / `id_matches_client` / `client_id_on_file`; `verifyDocument.ts` binds it, records the `verify_extraction` audit row and decides approve / reopen / stall. The kickoff (`kickoff.ts`) already fetches both the questionnaire item and the CRM card as `{title, text}` columns and stores engagement fields through `clients.setDeclarationEngagement` (a JSONB merge into `agent_fields`). The planner prompt is assembled in `prompt.ts` from fenced sections; the questionnaire answers are already rendered (`SUBMITTED QUESTIONNAIRE`). Nothing in the platform knows a second person. Also relevant: the current client-id title regex (`ת"ז` in any punctuation) would match a "ת"ז בן/בת זוג" cell and take the spouse's id as the client's.

## Goals / Non-Goals

**Goals:**
- One place that answers "who is this document about" against client + spouse, pure and unit-testable, with adoption as an explicit output rather than a side effect hidden in the checks.
- Trust order that cannot be reversed by a document: questionnaire / CRM cells beat anything a file says; a file can only fill a gap, never overwrite.
- Zero schema migration; the spouse rides in `agent_fields`.

**Non-Goals:**
- Learning the spouse from the conversation (the planner has no "record the spouse" action; the client saying "my wife מיכל" is background only). If needed later it is a new decision field with evidence, like resolutions.
- Editing or clearing the spouse from the workspace (a wrong inference is fixed by re-firing the kickoff with the spouse cells filled, which wins over the inferred value, or by hand in the DB for now).
- Children or other household members; the tax-portal login (always the client's own id).
- Changing the classifier / extraction prompts: the extractor already returns `subject_name` and `subject_id_number`.

## Decisions

**D1. Storage: `agent_fields.spouse` + `agent_fields.marital_status`, no migration.**
`spouse = { name: string | null, id_number: string | null, name_source: 'questionnaire' | 'crm' | 'document' | null, id_source: 'questionnaire' | 'crm' | 'document' | null }`, `marital_status = 'married' | 'not_married' | null`. A small pure module `spouseIdentity.ts` owns the type, a `readSpouse(agentFields)` parser (tolerant: missing/garbled → empty spouse) and `mergeSpouse(current, incoming, trust)` implementing the precedence (questionnaire > crm > document; equal or lower trust never overwrites a present value). `clients.setDeclarationEngagement` gains `spouse` and `maritalStatus` fields (same JSONB merge). *Alternative:* columns on `clients` — rejected, the rest of the engagement identity (file number, year, id) already lives in `agent_fields` and the platform is single-agent.

**D2. Cell recognition lives next to `crmIdNumber`, deterministic, no model.**
`crmIdentity.ts` gains `SPOUSE_TITLE` (`בן זוג|בת זוג|בן/בת ה?זוג|בן או בת זוג|\b(spouse|partner)\b`), `crmSpouse(columns) → { name, idNumber }` and `crmMaritalStatus(columns)`. `crmIdNumber` additionally excludes titles matching `SPOUSE_TITLE`. The kickoff calls the three readers on the questionnaire columns first and the CRM columns second and merges with D1. Same reasons as the existing id rule: a title-only rule is what an office can configure on its board; free-text answers ("קרן פנסיה למיכל וניב") are deliberately NOT mined for a spouse name — the model already sees them in `SUBMITTED QUESTIONNAIRE` and code must not guess identity from prose. *Alternative:* ask the form-intake model for the spouse — rejected, identity is ground truth for a gate and must not come from an LLM read of untrusted text.

**D3. Identity resolution is one pure function; adoption is a returned proposal.**
`resolveSubjectIdentity(fields, ctx) → { matched: 'client' | 'spouse' | null, adopt?: { idNumber, name }, checks: CheckResult[] }` in `spouseIdentity.ts` (imported by `verifyChecks.ts`). `CheckContext` gains `spouse: SpouseOnFile` (name, masked-able id, sources) and `maritalStatus`. `runChecks` calls it for the `subject` / `id_matches_client` / `spouse_adopted` / `client_id_on_file` entries and returns `adoptSpouse?: {...}` on `ChecksVerdict`. Order of decisions, printed id present and client id on file:
1. equals client → matched client.
2. equals spouse id on file → matched spouse.
3. else if checksum fails → `id_checksum` fails as today, no adoption (the `id_matches_client` entry fails with the third-person / no-match note, expected lists what is on file).
4. else if spouse id on file → fail: third person.
5. else if `marital_status === 'not_married'` → fail: registered as not married.
6. else if spouse name on file and `!namesLooselyMatch(subject_name, spouse.name)` → fail: name does not match the spouse on file.
7. else → matched spouse + `adopt = { idNumber, name: spouse.name ?? subject_name }`, `spouse_adopted` entry.
`subject` then passes iff `matched !== null` or (no printed id and name loosely matches client or spouse name); a contradicting id (step 3–6) fails `subject` too. No client id on file: only step 2 applies, otherwise today's `client_id_on_file` path; never adopt (we cannot tell the client from a stranger). *Alternative:* adopt inside `verifyDocument.ts` after the checks — rejected, the gate row must show the adoption as a check and tests must cover the rule without I/O.

**D4. Persist the adoption before the next verification; re-read before each.**
`verifyCollectedDocument` loads the spouse with `readSpouse` from a fresh `clients.getById` at the start of every verification (the batch is sequential; the `ClientRow` passed in is stale after the first adoption). When the verdict carries `adoptSpouse`, it merges with trust `document` (never overwrites), writes via `setDeclarationEngagement`, records `client.spouse_inferred` (actor system, target the document, detail: masked id, name, fileId) and `publishClientUpdated`. Adoption happens regardless of the other checks' outcome: the wife's pension that fails `type_fields` still teaches the spouse, so the reply talks about the account number and not about a stranger's document. The `verify_extraction` audit detail additionally carries `subject_matched: 'client' | 'spouse' | null`.

**D5. Prompt: a `CLIENT IDENTITY` fenced block + three rule lines in `prompt.md`.**
`buildClientIdentitySection(token, client, idOnFile: boolean)` renders name, "id on file: yes/no", marital status with source, spouse name / "name unknown" / "none on file", id known + source. The id digits never reach the model (the block says "known", never the number, matching the "never asks for an id number" rule). Rules added to `prompt.md` under the documents guidance: spouse assets belong to the declaration; instance names carry the spouse's name; tie by holder name when two same-type same-company instances exist; never ask for an id number. `PLATFORM_SECTIONS` gains the block name; `buildPrompt` places it right after the documents section. *Alternative:* fold it into the questionnaire section — rejected, the questionnaire is untrusted client text; identity is system-known fact and must be fenced separately.

**D6. Gate reporting keeps the `id_matches_client` key.**
The key stays so older trails and the i18n label map keep working; its meaning widens ("belongs to the client or the spouse") and the label text is updated. The informational `spouse_adopted` entry is a new key with a new label. `client_id_on_file` keeps its semantics. `expected` strings are built by one helper (`describePerson('client' | 'spouse', maskedId, source)`) so the trace wording is consistent; sources gain `questionnaire` / `crm` / `document` next to today's `credentials` / `monday_crm`.

**D7. Evals judge gets the spouse.**
`VerifyDocumentCase.client` gains optional `spouse: { name, idNumber } | null` and `maritalStatus`; the judge passes them into `runChecks` and applies the same `subject_name_matches` rule (id matches client or spouse, else names). A new case pair on an existing synthetic PDF (the study-fund file) with a spouse whose id equals the printed one, and one with a third-person expectation, uses `expected.verdict.failed_keys: ['id_matches_client']`. No new PDFs (the regen churn rule in memory).

**D8. Workspace line.**
The capital documents card (the component behind the documents tab) reads `client.agent_fields.spouse` / `marital_status` (already delivered with the client row) and renders one muted line; masking happens in the client with the same last-three-digits rule. No new API.

## Risks / Trade-offs

- [The first foreign document defines the spouse, even if it was sent by mistake] → only with a checksum-valid id, only when the client is not registered as not married, only when it does not contradict a spouse name from the form; the adoption is audited and visible in the workspace; the questionnaire/CRM cells override it on a re-fired kickoff. A workspace "clear spouse" action is a possible follow-up.
- [An office's board has no spouse columns, so everything rests on inference] → that is the status quo plus inference; the marital-status cell (present on the current form) still blocks inference for singles.
- [Joint documents printing two names / two ids] → the extractor returns one subject; whichever it picks matches one of the two people, so the document passes. Not worse than today.
- [Stale `ClientRow` inside a batch] → D4 re-reads per verification; the follow-up planning cycle already reloads the client.
- [`namesLooselyMatch` is deliberately loose (one shared token)] → it only gates adoption when the form already gave a spouse name; a shared surname is enough, which is the intended tolerance for "י. תמיר" / "מיכל תמיר".

## Migration Plan

No DB migration. Deploy code; existing clients have no spouse until the next kickoff or the next verified spouse document. The stalled wife documents of the local test client are re-verified by re-collecting them after deploy (or by re-firing the kickoff and resending). Rollback: revert the code; `agent_fields.spouse` is ignored by older code.
