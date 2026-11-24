## Why

A checklist item for a pension, provident or study fund that names no company ("אישור יתרת קרן פנסיה ליום 31.12.2025 — קרן פנסיה") is matched to no fetch website, so the agent never learns that a website fetch exists and asks the client for an upload instead. In production (client 4b3f8669, 2026-11-24) the three fund items came out of the questionnaire without a company, the planner prompt had no DOCUMENT FETCH section at all, and the client was asked to upload documents the platform could have pulled from Harel, Migdal, Phoenix, Menora, Meitav or Altshuler Shaham.

## What Changes

- The planner prompt marks every pending item of an institution-bound type whose name identifies no company as "company unknown", and lists the fetch websites that would become offerable for that item once the company is known (only sites the client can actually use: id number on file, WhatsApp allowed).
- The planner asks the client which company manages such a fund as part of asking for the document (one question, the catalog's wording), and, when the client names a site the platform can fetch from, says in the same reply that the document can be pulled from that site instead of uploaded.
- New planner tool `set_company`: on the client's quoted words, code renames the item "<item> — <company>" (table label when the company is recognised, the client's words otherwise). Gate checks: row pending, type institution-bound, item names no company yet, verbatim quote that contains the company.
- The next planner run sees the renamed item, the existing fetch matching finds the website, and the DOCUMENT FETCH block appears with the normal offer / agree / login flow. No change to the fetch providers themselves.
- Trace: one `set_company` step per call (old name, new name, quote, recognised company or "not in table"), audit event `document.company_set`.
- A planner eval case for the new behaviour.

## Capabilities

### New Capabilities
- `item-company-clarification`: an item that names no company is clarified with the client and renamed on their words, so file matching and website fetches can find its company.

### Modified Capabilities
- `conversation-trace`: `set_company` joins the list of tool-call steps (one step per call, named after the tool, with names beside ids).
- `code-gates`: the `validate_message` gate reports the `set_company` checks.

## Impact

- `src/agents/declarationOfCapital/`: `decisionTools.ts` (tool), `decisionSchema.ts` (gate checks, normalized decision), `plan.ts` (apply step, audit), `prompt.ts` + `prompt.md` (company-unknown line, site list, asking rule), `toolStepDetails.ts` (step detail), `taxFetch/flow.ts` (helper: sites a renamed item would match).
- `src/db/queries/clientDocuments.ts`: rename of a live item (reuse of the split write).
- `docs/pipeline.md` rows for the new tool; `tests/` unit tests; `evals/cases/planner.json` new case.
- No migration. Production behaviour changes only for items that name no company; items that already name one are untouched.
