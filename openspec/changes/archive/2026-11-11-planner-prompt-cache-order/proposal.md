## Why

Every planner call sends ~29,500 input tokens to gpt-6-astra at the full $10/M price (about $0.29 per call, $23 over the last 30 days locally) because OpenAI's prompt cache almost never hits: the last 30 days show ~1,800 cached tokens per call out of 29,500. Measured on 2026-11-11 against the live API with a real planner request: gpt-6-astra caches the `instructions` + tools block only when it is byte-identical to a recent call (a change anywhere in the instructions, even in the last line, gives 0 cached tokens), and the planner's system prompt carries per-client and per-call text (accountant name, client name and phone, engagement date, the current time, the calendar, and a random per-request fence token), so no two calls ever match.

## What Changes

- The planner's system prompt becomes static: the same bytes for every client and every call of the same declaration year. All per-call values move out of it into a new platform-written section at the start of the input (`contents`): accountant name, client name and WhatsApp number, engagement start date, current time (UTC and local, with the timezone), time since the last message, and the upcoming-dates calendar.
- The untrusted-data doctrine (appended to the system prompt) stops embedding the random fence token; it tells the model the request code is the one inside the square brackets of the first line of the input (the opening fence of the new section).
- The prompt sentences that today quote the accountant or client inline (the opening line, the goal line, the self-introduction rule, the "local time stated below" rule, the calendar rule) point to the new section instead.
- `PROMPT_PLACEHOLDERS` shrinks to `tax_year`; `buildSystemPrompt` no longer needs the client, accountant, history or clock; the admin `#/llm-stages` planner entry describes the new section.
- Not changed: the tool set offered per context (the `conclude` enum still drops `collect` in the follow-up cycle, openspec `collect-decision`), so a handful of tool variants exist and each is cached on its own; Gemini and Anthropic transports; the thread and documents sections.

## Capabilities

### New Capabilities
- `planner-prompt-caching`: the planner's fixed instructions are identical across calls so provider prompt caches can serve them; per-request facts travel in a platform section of the input.

### Modified Capabilities
- (none — `injection-defense` has no requirement on where the fence token is stated; `planner-thread-context` and `planner-answer-schema` are untouched)

## Impact

- `src/agents/declarationOfCapital/prompt.md` (template wording), `prompt.ts` (`buildSystemPrompt`, `buildPrompt`, new `buildRunContextSection`, `PLATFORM_SECTIONS`, `PROMPT_PLACEHOLDERS`), `src/agents/shared/promptSafety.ts` (`buildUntrustedDataDoctrine` signature), `src/gemini/llmStages.ts` (planner stage description), `docs/agents.md` + `docs/pipeline.md` (prompt layout), tests for the new section and the doctrine.
- Cost: on OpenAI the ~16,000-token fixed part (instructions + tools) is billed at $1/M instead of $10/M on every call that follows another planner call within the cache lifetime (minutes to an hour): roughly $0.29 → $0.15 per call. Gemini's implicit prefix cache benefits the same way. No effect on Anthropic until `cache_control` is added (out of scope).
- Risk: prompt wording changes can shift planner behaviour; the planner evals run before/after guard it.
