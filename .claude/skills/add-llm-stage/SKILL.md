---
name: add-llm-stage
description: Add a new LLM call (stage) to the platform with its code gate, audit row, tests, stage description, eval adapter and docs. Use when adding or renaming an LLM purpose, a validate_* / verify_* step, or a new model call site.
---

# Add an LLM stage

Every LLM result in this repo is followed by a **named code gate** (a pure function that checks the
model's answer). The gate has its own step name, one audit row per run with `detail.result: true/false`,
an entry in the admin "LLM stages" page and an eval adapter. Nothing the model proposes is used
before the gate accepts it. A gate never flips a security verdict (fail closed): it drops or rejects,
it does not make a "suspected" answer "clean".

Rule from the owner (2026-09-09): "every result schema should have a code verification". Do not skip
the gate or the injection screen because a stage "looks isolated".

## Names

| Thing | Pattern | Example |
|---|---|---|
| purpose (the LLM call, `llm_calls.purpose`) | `snake_case` noun | `file_classification` |
| gate step (the audit action) | `validate_<thing>` / `verify_<thing>` | `validate_classification` |
| pure rules module | `src/agents/<agent>/<name>Rules.ts` | `src/agents/declarationOfCapital/analyzeFileRules.ts` |
| runtime module | `src/agents/<agent>/<name>.ts` | `src/agents/declarationOfCapital/analyzeFile.ts` |
| request builder | `build<Name>Call` | `buildAnalysisCall` |
| test | `tests/<name>Rules.test.ts` | `tests/analyzeFileRules.test.ts` |

Study `src/agents/declarationOfCapital/analyzeFile.ts` + `analyzeFileRules.ts` first: the smallest complete example.

## Checklist (do all of it, in this order)

1. **Pure rules module** `<name>Rules.ts`: the zod schema of the model output and the gate
   `validate<Name>(raw, context)` returning `{ result: boolean, reason: string | null, checks: GateCheck[], ...checked }`.
   `checks` (`agents/shared/gateChecks.ts`, build entries with
   `check(key, passed, note, { observed, expected })`) lists only the checks that actually ran, in
   order — a check that did not apply is absent, never "passed"; a failed entry carries its reason
   as `note`; every entry carries `observed` (the value the check looked at, as short text, also on
   a pass) and `expected` (the reference, when there is one). National ids go through `maskId`.
   Give each check a stable snake_case key.
   No imports of `gemini/`, `db/`, `audit/`. Tests must run with no API key and no database.
   Strings the model quotes as evidence must appear **verbatim** in the text the model saw
   (whitespace-normalized) — see `validateInjectionScan`, `validateFormResolutions`.
2. **Tests** `tests/<name>Rules.test.ts` (`node:test`, `assert/strict`): one passing case, one per
   rejection reason, one boundary case, and one that asserts the exact `checks` list (keys, order,
   `passed`, `note`, `observed`, `expected`) for a pass and for a failure. Add the file to the `test` script in `package.json`, run `npm test`.
3. **Runtime module**: `export const <NAME>_PROMPT` (template, placeholders `{{name}}`, fence token
   `{{token}}`); trusted instructions in `systemInstruction`, only untrusted data in the user turn,
   inside nonce fences from `agents/shared/promptSafety.ts`. `export function build<Name>Call(...)`
   returns the exact `LlmCallSpec` (`gemini/llmCall.ts`) — the evals harness reuses it, so the call
   site must do `runLlmCall(build<Name>Call(...), { log })` and nothing else. Then: parse → gate →
   `recordAudit` (actor `system`, action = the gate step, `severity` info/warning/critical, `targetId`,
   `detail.result` + `reason` + `detail.checks` (the gate's list, copied as is — the trace viewers
   turn a row with `checks` into a clickable ✓ / ✗ list) + the fields the timeline prints; no raw ID
   numbers in `detail`). Add a Hebrew label per check key in `web/src/i18n.tsx` (`gateCheckLabels`)
   and the gate's English title in `codeGateLabels`.
4. **Register the purpose** in `LLM_CALL_PURPOSES` (`src/gemini/modelCatalog.ts`) and the gate action
   in the `AuditAction` union (`src/audit/audit.ts`). Add a Hebrew label in `web/src/i18n.tsx`
   (`llmPurposeLabels`).
5. **Describe the stage** in `src/gemini/llmStages.ts` (`TEMPERATURES` + `STAGES`: purpose, title,
   file, gate, prompts, query layout, schema). `tests/llmStages.test.ts` fails until this is done.
6. **Injection layers for new untrusted input.** New attacker-controlled content passes the same
   three steps first: `runInjectionRegexStep` (`agents/shared/injectionScreen.ts`), the dedicated
   LLM screen (`screenForInjection` / `screenFileForInjection`), and its gate
   `validateInjectionScan`. A hit stops before your stage runs. Files with no text layer still get all three.
7. **Evals**: run `/add-eval-case`. A new stage needs an adapter in `evals/stages.ts`
   (`build` calls your builder, `judge` runs your gate first, then compares fields) and a
   `evals/cases/<purpose>.json` with ~10 cases.
8. **Docs**: `docs/agents.md` "Code gates and the three injection layers" — add the step name and
   the module.
9. **Verify**: `npm run typecheck`, `npm test`, then run the flow once against the dev stack and check
   the audit row appears in the admin conversation timeline (#/agents → conversation → steps).

## Do not

- call `runLlmCall` without a gate after it, or apply a model field before the gate accepted it,
- let a gate turn `suspected_injection: true` or `legible: false` into a pass,
- accept an id, key or name the model was not shown in its prompt,
- resolve the model yourself: `runLlmCall` reads the admin's per-purpose setting; only the harness overrides it.
