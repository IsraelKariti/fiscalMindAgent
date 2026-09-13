## Context

See proposal.md for motivation.

Observed today:

- Both trace surfaces render steps from the same `AdminConversationStep` shape (`id`, `occurredAt`, `action`, `severity`, `detail`, …). The admin conversation endpoint (`src/api/llmAdmin.ts`) serves every audit row of the client as a step, so a row can be any `AuditAction`, not just gates and `apply_*`.
- `GateChecksModal.tsx` already owns the modal (portal to body, Escape, backdrop, header with label / action / time / result / reason, checks list, collapsed raw JSON). `StepRow` (Timeline) and `AdminStepRow` (AgentConversationsCard) wrap the row content in a button only when `gateChecksOf(step)` returns a list.
- Step details are uneven. `apply_additions` records anchor ids plus instance names. `apply_retirements` records ids only. `apply_resolutions` records id plus verdict. `apply_collections` and `document.collected` record ids only. `document.retired`, `document.instances_added`, `document.claimed`, `document.verified*`, `review.*`, `send_reply`, `wa.*`, `email.*` already carry names, channel or times.
- `plan.ts` has the client's `documents` list in scope at every `step(...)` call (it is reloaded after the apply block), and `addInstances` / `retire` return the affected rows, so names are available without extra queries.

## Goals / Non-Goals

**Goals:**

- One modal component for every step; no second modal type.
- Readable summaries for the steps an admin meets in a normal cycle, with a generic fallback so any other row is still explorable.
- Backward compatible with existing audit rows (ids only) and with rows from any future action.

**Non-Goals:**

- Rewriting or backfilling old audit rows.
- Linking from the modal to the document or draft (navigation).
- Changing what the accountant sees.

## Decisions

**1. Generalize `GateChecksModal` into a step detail modal rather than adding a second modal.**
`checks` becomes optional. The component renders: header (unchanged), reason (unchanged), a new "what this step did" section, the checks section only when `checks` is non-null, raw JSON (unchanged). File keeps its name and exports so the two call sites change minimally; the component is renamed `StepDetailModal` with `GateChecksModal` kept as an alias only if that avoids churn in tests. Alternative rejected: a separate `StepDetailModal` with a duplicated shell, which doubles the CSS and Escape/portal logic.

**2. Summary rendering: a small per-action renderer map with a generic fallback.**
A pure function `stepSummaryOf(step): SummaryRow[]` where a `SummaryRow` is `{ label, value }` or `{ label, items: string[] }`. Known actions get a hand-written mapping (`apply_resolutions`, `apply_additions`, `apply_retirements`, `apply_collections`, `apply_attestation`, `send_reply`, `document.*`, `review.message_pending`, `review.message_held`, `client.attestation_*`, `planner.rerun_after_verification`, `goal.completed`, `email.client_sent`, `wa.*`). Unknown actions, and any detail key the mapping did not consume, fall through to a generic renderer: one row per top-level key, arrays of primitives as item lists, objects and arrays of objects as compact JSON on one line. `clientName` is always dropped (every row repeats it). Labels come from a new `stepFieldLabels` map in `i18n.tsx` with `humanizePurpose(key)` as the fallback, mirroring `gateCheckLabels`. Alternative rejected: a fully generic key/value dump only, which shows `rows: [{id: …}]` for retirements and defeats the purpose; also rejected: server-side rendering of summaries, which would put presentation in the audit path.

**3. Name lookup happens at recording time, not in the UI.**
`plan.ts` adds `name` (and for pairs `fileName` + `documentName`) to the apply-step details using the in-scope `documents` and `files` lists and the rows returned by the mutations. The UI reads `name ?? id`. Alternative rejected: resolving ids to names in the browser from the client's current documents list, because retired or renamed rows and the admin viewer (which has no documents list loaded) would show ids anyway, and the audit row is meant to stay meaningful on its own (the `detail` doc comment in `audit.ts` already asks for labels because FKs null out on delete).

**4. Step labels for non-gate actions.**
`codeGateLabels` is extended (or a sibling `stepActionLabels` map added) with English labels for the apply and document actions, in the same style as the existing gate labels. Unknown actions keep the `humanizePurpose` fallback.

**5. Row affordance.**
Both row components always wrap their content in the existing `timeline-trace-gate` button; the `checks ?` branch goes away. The `aria-label` prefix string becomes a neutral "open step details" text (`gateModalOpen` wording updated). The hover `title` with raw JSON is dropped from the row since the modal now carries it.

## Risks / Trade-offs

- [Detail keys drift from the renderer over time] → the generic fallback lists any unconsumed key, and the raw JSON section stays, so nothing is ever hidden; a unit test pins the mapping for each apply step against the shape `plan.ts` writes.
- [Long evidence quotes or instance lists blow the modal height] → reuse the existing `gate-modal` scroll rules (the modal already scrolls its check list after the recent clipping fix) and cap item lists visually with the same styles.
- [Old rows show ids] → accepted; stated in the spec, and the id is still copyable from the raw JSON.

## Migration Plan

No migration. Deploy web and worker together as usual; old audit rows keep working through the `name ?? id` fallback. Rollback is a plain revert.
