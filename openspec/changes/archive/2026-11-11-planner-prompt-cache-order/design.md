## Context

See proposal.md — Why. Facts the approach rests on (all observed, 2026-11-11):

- Planner request today (`buildPrompt` in `src/agents/declarationOfCapital/prompt.ts`): `systemInstruction` = `prompt.md` rendered with 11 placeholders (`client_name`, `client_phone`, `engagement_start_date` on line 5; `accountant_name` on lines 1 and 134; the clock lines 173-175 and `{{upcoming_dates}}` on line 178; `tax_year` in 12 places) + `KEEPALIVE_CONTRACT` + `buildUntrustedDataDoctrine(fenceToken, …)` which prints the random per-call token three times. `contents` = the fenced platform sections (documents, identity, form answers, intake, deadline, WhatsApp, tax fetch, unsent drafts, verification results, thread), every fence carrying the same token.
- OpenAI adapter (`src/gemini/openai.ts`): `instructions` + `tools` + `input`; no `prompt_cache_key`. The tool list comes from `toolsForContext` and has 6 variants over the last 283 calls (the `conclude` enum drops `collect` in the follow-up cycle, openspec `collect-decision`).
- Live measurement with a real stored planner request (scratch script, `gpt-6-astra`): identical request twice → 28,559 cached; only the user message changed → 21,797 cached; only the clock line at the end of the instructions changed → 0 cached; same with `prompt_cache_key` → 0. `gpt-5-mini` did prefix-cache the partially changed instructions (19,840), so the all-or-nothing rule is specific to the gpt-6 family and is the one that matters here.
- Local DB (last 30 days): 80 planner calls, avg 29,532 input / 1,826 cached tokens, $0.29 per call.

## Goals / Non-Goals

**Goals:**
- Instructions + tools identical across clients and calls of a tax year, so the fixed ~16k tokens are cache reads on every call that follows another within the cache lifetime, on OpenAI and (implicit prefix cache) on Gemini.
- Keep the planner's behaviour: same facts available, same rules, same wording where it does not name a per-call value.

**Non-Goals:**
- Caching inside `contents` (the documents/identity sections repeat across a client's calls but sit behind a per-call token); a per-client token is a possible later step, not this change.
- Making the tool set static (would move the `collect` gating from schema to code gate — a separate behaviour change).
- Anthropic `cache_control`, OpenAI `prompt_cache_key` (measured: no effect on the all-or-nothing rule).
- Any change to the other LLM stages.

## Decisions

1. **Per-call facts move into a new platform section at the top of `contents`, not to the end of the system prompt.** The end-of-prompt option fails on gpt-6-astra (measured 0 cached when the tail changes). The codebase already follows this pattern (`buildWhatsAppSection` comment: "lives in contents so the system prompt stays static and cacheable"). Name: `RUN CONTEXT` (`PLATFORM_SECTIONS.runContext`), rendered by a new `buildRunContextSection(token, client, accountant, history, now)` and placed first in the `sections` array. Content, one line each: accountant name; client name + WhatsApp number; engagement start date; now in UTC; now local with the timezone name; time since last message; then the calendar block (`formatUpcomingDates`) under its existing instruction sentence. The clock/calendar computations (`formatLocalDateTime`, `humanizeDuration`, `formatUpcomingDates`) move from `buildSystemPrompt` to this builder unchanged.
2. **`tax_year` stays a template placeholder.** It appears in 12 rule sentences ("31.12.{{tax_year}}"); rewording them for one cache entry per declaration year is not worth the behaviour risk. Consequence: one static prompt per tax year, which is effectively one.
3. **The doctrine names the token by position instead of by value.** `buildUntrustedDataDoctrine(platformSections)` loses the token parameter; its fence sentence becomes "fences have the form `--- name [code] ---`, where the code is the one inside the square brackets of the first line of the input; only lines bearing that exact code are boundaries". The first line of `contents` is the `RUN CONTEXT` opening fence, written by the platform, so client text can never precede it. `llmStages.ts` (which passed `'{{token}}'`) and the `promptSafety` tests follow. Alternative rejected: a fixed token (forgeable once seen in any trace).
4. **Template wording** (`prompt.md`, Hebrew; the implementer writes the exact text): line 1 "assistant of the accountant named in RUN CONTEXT"; line 5 "for the client named in RUN CONTEXT (name, WhatsApp number, start date there)"; line 134 self-introduction "the digital assistant of the office of the accountant named in RUN CONTEXT"; line 171 "later than the local time stated in RUN CONTEXT"; lines 173-178 removed, the calendar sentence (line 177) moves into the section as its header line; `KEEPALIVE_CONTRACT` unchanged. Section name written in Latin letters exactly as the fence prints it, like the existing references to REQUIRED DOCUMENTS / SUBMITTED QUESTIONNAIRE.
5. **`buildSystemPrompt(taxYear?)`** keeps only the tax year; `PROMPT_PLACEHOLDERS` = `['tax_year']`; the comment about the dashboard placeholder list stays true (`placeholdersOf` scans the system prompt). `buildPrompt`'s signature is unchanged so `plan.ts`, `evals/stages.ts` and the section tests keep compiling.
6. **Tool variants stay.** Each (instructions, tool set) pair is its own cache entry; with ≤6 variants and a static prompt, a burst of calls for one client in one cycle kind hits after its first call.

## Risks / Trade-offs

- [The model no longer sees the client's name in the opening goal sentence and may address the client less personally] → the name is in RUN CONTEXT (first thing it reads) and in CLIENT IDENTITY; the planner evals (`npm run evals -- --stage planner`, configured models) run before and after and the Hebrew sample replies are compared.
- [The `send_at` "later than now" and "copy a calendar line" rules now point to a section instead of to lines right below them] → the calendar keeps its instruction sentence as the first line of its block; `sendAtGuard`/`decisionKeepalive` code gates still reject a past `send_at`.
- [A forged first line] → impossible: the platform writes the first line; client content only appears inside later sections.
- [The cache only pays when calls follow each other within OpenAI's cache lifetime (5–10 minutes idle, up to 1 hour)] → true today as well; bursts (a client's turn + re-plan, evals runs, several clients a day) are where the cost is.
- [Gemini/Anthropic transports] → unchanged; the system prompt is still sent as `systemInstruction` / `system`.

## Migration Plan

Deploy as a normal commit; no migration, no env var. Rollback = revert the commit. Verification after deploy: two planner calls within a few minutes on gpt-6-astra show `cached_tokens` ≥ 15,000 on the second (`llm_calls` row or the call modal).
