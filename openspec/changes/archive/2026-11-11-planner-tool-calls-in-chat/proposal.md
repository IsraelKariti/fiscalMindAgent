## Why

Since `planner-tool-calls` the conversation planner answers with tool calls (`tie_file`, `mark_collected`, `send_whatsapp_text`, `conclude`, ...), but the chat trace still shows the execution under the names of the old answer form: `apply_collections`, `send_reply`, `withhold_reply`. An admin who reads the call modal sees `tie_file` and `mark_collected`, then sees `apply_collections` in the chat, and cannot tell when each call ran, which row executed it, or what came of it (tied, refused, collected, claimed). The translation from tool calls to the old step names has no value of its own and confuses the reader.

## What Changes

- **One timed step per tool call.** After the `validate_message` gate accepts the answer, every tool call is executed and recorded as its own code step, named exactly after the tool: `resolve_document`, `add_instance`, `retire_document`, `state_cost`, `state_vehicle`, `attestation`, `tie_file`, `mark_collected`, `send_whatsapp_text`, `send_whatsapp_template`, `tax_fetch`, `conclude`. Each step records the time it ran, the call's parameters with names resolved (document name, file name), and its outcome (for example `tie_file` → tied, re-pointed to the row the company split created, or refused with the reason; `mark_collected` → collected, claimed, or left pending with the reason).
- **The old group steps are no longer written**: `apply_resolutions`, `apply_additions`, `apply_retirements`, `apply_stated_costs`, `apply_vehicle_declarations`, `apply_attestation`, `apply_collections`, `send_reply`, `withhold_reply`. Rows written before this change stay readable with their current labels and renderers.
- **Outcomes that code adds on top of a call stay on that call's step**: the per-company split (rename and created siblings) on the `tie_file` step of the file that caused it, files assigned to a new instance on its `add_instance` step, the send time rolled off weekends on the `send_whatsapp_*` step, the withheld reply and the verification batch on the `conclude` step (decision `collect`), goal completion on the `conclude` step (decision `goal_complete`).
- **The chat tells a tool step from a code step**: tool-call steps carry a tool icon; the shield stays for checks and security events; the gear stays for code-only actions (`send_closing`, `send_decline_ack`, `planner.rerun_after_verification`, ...). The step modal shows a tool step's parameters and outcome as labelled rows.
- **The gate is unchanged**: the whole answer is still checked before anything runs, and a rejected answer still gets one corrective retry with nothing executed.
- **Where other specs name an old step** (`apply_collections` for split and refusal records, `apply_stated_costs` for the stated-cost audit row), the same facts are now recorded on the tool-call step of the call they belong to. Those specs keep their wording; a redirect requirement in `conversation-trace` governs.
- Admin-only as the whole trace. No migration.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: "Apply steps record what they changed by name" becomes "Tool-call steps record the call and its outcome by name"; added requirements for one step per tool call, the `conclude` step, the tool icon, the discarded-draft matching on the send steps, and the redirect of old step names in other specs.

## Impact

- `src/agents/declarationOfCapital/plan.ts` (every apply function records per call; `collectFiles` attributes split, collect/claim and refusals to the calls; `scheduleReply`, `verifyThenReplan`, `completeGoalIfDone` record on the tool steps), `src/agents/declarationOfCapital/decide.ts` (returns the accepted calls with the decision), `src/audit/audit.ts` (new actions), `src/api/llmAdmin.ts` (discarded-draft matching on `send_whatsapp_text` / `send_whatsapp_template` as well as old `send_reply`).
- `web/src/components/Timeline.tsx`, `web/src/components/admin/AgentConversationsCard.tsx` (icons), `web/src/components/stepSummary.ts` and `StepDetailModal.tsx` (renderers), `web/src/i18n.tsx` (labels).
- `docs/pipeline.md`, `docs/agents.md`; tests `applyStepDetails`, `stepSummary`, `stepLink`, `timelineRows`, the plan tests.
- Not changed: the planner prompt, the tools, the gate checks, the evals harness, the call modal, `#/llm-stages`.
