# Evals harness

Runs a fixed case set for each of the platform's five LLM stages (`LLM_CALL_PURPOSES` in
`src/gemini/modelCatalog.ts`) against a list of models, judges every answer **in code**, and stores
tokens, latency, cost and the verdicts in one JSON file.

```
npx tsx evals/run.ts                                   # all 5 stages x every model whose API key is set -> evals/results/run-<ts>.json (+ latest.json, report.html)
npx tsx evals/run.ts --models gemini-2.5-flash,gpt-5.6-luna --stages file_classification
npx tsx evals/run.ts --cases inj_08,cls_09 --concurrency 2 --out evals/results/smoke.json
npx tsx evals/rejudge.ts [--in file.json]              # re-apply the code judges to stored outputs - no model calls
npx tsx evals/report.ts [--in file.json] [--out r.html] # rebuild the report page (a run does this itself)
npx tsx evals/serve.ts                                 # http://127.0.0.1:3211 - same page, rebuilt on every load
npx tsx evals/make-files.ts                            # regenerate the synthetic PDFs in evals/files/ (needs Chrome: CHROME_PATH)
npx tsc -p evals/tsconfig.json                         # typecheck the harness (the root tsconfig does not include evals/)
```

Flags: `--stages a,b`, `--models x,y`, `--cases id,id`, `--concurrency N` (default 4), `--out file.json`
(`--out` keeps `latest.json` untouched only in the sense that both are rewritten — use a separate folder for a
smoke run you don't want to become "latest"). Default models = `LLM_MODEL_OPTIONS` filtered to providers whose
key is in `.env` (`GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). The platform's OpenAI adapter does not
expose a reasoning-effort setting, so there is no `--effort` flag.

The harness sends **exactly what the app sends**: every request goes through the same builders the call sites
use (`buildInjectionScreenCall` / `buildFileScreenCall`, `buildFormIntakeCall`, `buildAnalysisCall`,
`buildExtractionCall`, `buildPrompt` + `buildDecisionCall`) and through `runLlmCall()` with an explicit `model`
(so `app_settings` is never read — no database needed) and a file log sink: every call lands as one JSON line in
`evals/data/llm_calls.jsonl` (gitignored) instead of the `llm_calls` table. Every answer passes the stage's own
code gate before it is judged. Spend cap: `EVALS_MAX_SPEND_USD` (default 30), summed from the run's own priced
rows before each call; a model the API does not know fails the rest of its group without calling.

`src/config/env.ts` loads `.env` at import and requires `DATABASE_URL`, `REDIS_URL`, `GEMINI_API_KEY`,
`SECRET_ENC_KEY`, `RESEND_API_KEY` to be *set* — none of them is used (Redis is opened at import by a transitive
import and closed immediately by `evals/isolate.ts`).

## The report page

`evals/results/report.html` is self-contained (the results JSON is embedded): double-click it, or serve it. One
tab per stage. Each tab has the table of every model (provider, runs, pass-rate bar, errors, avg latency,
input / output / thinking tokens, cost — click a header to sort, click a row to see each case with its failed
checks, expected vs actual, and the message / reasoning / evidence the model produced) and the cost-vs-speed
scatter of the models that scored 100% (avg latency x avg cost per call, hover a dot). Dark / light toggle.

## What is judged, per stage

| Stage | Cases | Code judge |
|---|---|---|
| `injection_detection_llm` | 10: 8 text (5 benign incl. innocent "להתעלם" / "המערכת" / rude, 3 attacks incl. English, Hebrew override and a Hebrew disguised one no regex catches) + 2 files (hidden payload, clean real PDF) | after `validateInjectionScan`: `suspected_injection` equals expected. `info.regexWouldCatch` reports whether `injection_detection_regex` would have short-circuited before this call (in the app it does) |
| `questionnaire_schema_mapping` | 18 WorkForm questionnaires (15 Hebrew questions, one per catalog type, the savings question combined): blanks, explicit no, per-account instances, foreign bank, investment house, combined savings question partially answered, spouse's fund, prior declaration by our / another office / unknown, ambiguous, real-estate purchased / inherited / gifted, vehicle with / without receipt, two vehicles, mortgage inside the real-estate answer, savings-for-every-child, investment provident + savings policy, debtor / shareholding / power of attorney | every `verdict` per type_key (all 17); for required types the gate-accepted instance count and a substring per instance name; `validateFormResolutions` dropped 0 |
| `file_classification` | 10 PDFs: 2 real (Hapoalim abbreviated annual report, Pepper/Leumi balance certificate) + 8 synthetic (right/wrong year, study fund certificate, pension annual report, USD portfolio activity report, transaction-printout lookalike, hidden injection, prior declaration) against a 6-row post-intake checklist | after `validateClassification` (capital_declaration purpose): `document_type`, `matched_document_id`, `legible`, `injection_suspected`; `document_kind` contains a keyword |
| `extract_document` | the same 10 PDFs, each against the checklist row it should satisfy | `is_expected_type`, `subject_id_number`, `as_of_date`, `valid_until`, name match (`namesLooselyMatch`), a key amount (value ±0.005 + currency), `legible`, `injection_suspected`; then `runChecks()` must reach the expected verdict (`passed` + every listed `failed_keys` key among the failures — keys, never the Hebrew reasons) |
| `generate_message` | 8 declaration-of-capital state snapshots (WhatsApp-only): first contact (template), first free-form turn, explicit answers resolving 3 rows, "what do you still need" with settled rows, reminder after silence (template), all settled → attestation request, client confirms → goal complete, burst of client messages with the agent's replies only in UNSENT DRAFTS → two new pension funds added as instances | after `normalizeDecision` (a throw = fail: evidence not verbatim, wrong channel, bad send_at): `decision`; for follow_up: channel whatsapp, `message_kind`, message names 31.12.<taxYear> (when `mentions_valuation_date` is not false), ≤ `max_question_marks` (3), `send_at` after `now` in `ACCOUNTANT_TIMEZONE`, no `no_settled_rows_mentioned` substring in the message; `resolved_documents` id set (+ per-id resolution, `instances` count), `added_instances` count per catalog type, `attestation` action |

Expected values live in `evals/cases/<stage>.json` next to each case (`expected` / `expects`); a list means any of
the listed values is accepted; a field that is not listed is not checked. They are decided from the platform's
rules (`formIntakeRules.ts`, `analyzeFileRules.ts`, `verifyChecks.ts`, `decisionSchema.ts`, the prompts), never
from a model's answer. Each case has `id`, `notes` (one sentence: what it proves) and its expectations. Case ids:
`inj_NN`, `map_NN`, `cls_NN`, `ext_NN`, `dec_NN`.

`generate_message` cases are plain row objects: `client`, `documents` (explicit rows; every other catalog type
is seeded `unresolved` unless `seedCatalog: false`), `thread` (inbound rows are the only evidence pool), `wa`
(window + template names from the file's `templates`), optional `unsent_drafts` (the agent's own undelivered replies, oldest first — never part of `thread`), optional `attestation`, and a fixed `now` — the adapter
turns them into `ClientRow` / `EmailRow[]` / `ClientDocumentRow[]` and the `DecisionContext` the way
`declarationOfCapital/plan.ts` does.

## Results file

```
{
  ranAt, finishedAt, models, stages, concurrency, maxSpendUsd, accountantTimezone, pricing,
  results: [ { stage, model, provider, caseId, notes, ranAt, pass, checks: [{key, expected, actual, pass}], info,
               latencyMs, attempts, inputTokens, outputTokens, thinkingTokens, cachedTokens, costUsd, error, output } ],
  summary: { <stage>: { <model>: { total, passed, passRate, errors, latencyMs: {avg,p50,p90,min,max},
                                    inputTokens, outputTokens, thinkingTokens, cachedTokens, costUsd, unpriced } } }
}
```

`output` is the model's parsed answer (the stage's own zod schema), so a failed case can be re-judged by hand or
by `rejudge.ts`. `costUsd` comes from the LiteLLM price table the app uses (`src/gemini/pricing.ts`) and is
`null` for a model missing there. `latencyMs` is wall-clock around `runLlmCall()` including retries (`attempts`).
The file is rewritten after every call, so a crashed run still leaves partial results.

## Files

- `evals/files/` — the test documents. `hapoalim.pdf` and `peper.pdf` are real (copied from the sibling
  project's `test_docs/`); the rest are generated by `evals/make-files.ts` from HTML via headless Chrome for the
  synthetic client Israel Israeli / ישראל ישראלי, ID 123456782.
- `evals/stages.ts` — per stage: case → request (+ parse), response → checks.
- `evals/run.ts` — the loop, the results file, the console summary. `evals/isolate.ts` — closes the Redis client
  a transitive import opens.
- `evals/report.ts` + `evals/report-template.html` — the page; `evals/serve.ts` — optional local server;
  `evals/rejudge.ts` — re-judge without calls.
- `evals/tsconfig.json` — typecheck config (`npx tsc -p evals/tsconfig.json`).
- `evals/data/` (LLM log) and `evals/results/run-*.json` are gitignored.
