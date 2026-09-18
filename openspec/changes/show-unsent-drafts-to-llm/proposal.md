## Why

The planner LLM only sees delivered messages. When a client sends several messages in a row, each new message replaces the agent's scheduled reply before it is sent, so the model sees a run of client messages and no trace of what it already drafted. On client `b49e84a5` (2026-09-18) the model saw nine client messages in a row while six of its drafts had been replaced and one was held for review; on the last message it named two new pension funds in its reply but did not add them to the document list.

## What Changes

- The planner prompt gains a new block listing the agent's own recent **unsent** outbound drafts (replaced by a newer plan, or held for review), each with its creation time, channel and body.
- The block states plainly that these drafts were **never delivered** and that the client has not read them.
- The block is bounded: only drafts created after the last delivered outbound message, at most the 5 most recent, each body capped in length.
- The delivered-message thread is unchanged: it still holds only sent and received messages, and every rule that reads it (attestation, evidence quotes, 24h window, tax-fetch readiness) keeps reading delivered messages only.
- The system prompt gains a short instruction on how to read the block.
- The evals harness can supply unsent drafts to a `generate_message` case, and a new case reproduces the 2026-09-18 burst.

This change gives the model missing context. It does not by itself guarantee the model adds the instances; a code gate for "reply names an item that is not on the list" is a separate, later change.

## Capabilities

### New Capabilities
- `planner-thread-context`: what conversation context the planner LLM is given about the agent's own messages — delivered ones in the thread, unsent drafts in a separate labelled block.

### Modified Capabilities

None.

## Impact

- `src/db/queries/emails.ts` — new read query for unsent outbound drafts.
- `src/agents/declarationOfCapital/prompt.ts` — new prompt section; `buildPrompt` takes the drafts.
- `src/agents/declarationOfCapital/plan.ts` — loads the drafts and passes them in.
- System prompt asset for the planner — one short paragraph.
- `src/gemini/llmStages.ts` — stage description on `#/llm-stages` lists the new block.
- `evals/stages.ts`, `evals/cases/generate_message.json` — optional drafts input and one new case.
- `tests/` — unit tests for the new section.
- No migration, no API change, no UI change. Prompt grows by at most a few hundred tokens.
