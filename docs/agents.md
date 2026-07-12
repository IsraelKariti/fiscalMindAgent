# Multi-agent platform architecture

Since 2026-07-11 (prod v11, migration 019) fiscalMind is a multi-agent
platform: one app hosting several developer-built agent types, each enabled
per accountant and owning its own client list. The document collector is
agent #1; `debt_collector` exists as a stub. Industry pattern followed: one
app with an agent registry (HubSpot Breeze / Salesforce Agentforce model) —
never one app per agent.

## Concepts

- **Agent type** — behavior + UI defined in code. Backend half in
  `src/agents/<type>/`, frontend half in `web/src/agents/<type>.tsx`,
  registered in `src/agents/registry.ts` and `web/src/agents/registry.ts`.
- **Agent instance** — one row in `agent_instances` per (accountant, type),
  created by admin enablement or auto-provisioning (`users.upsertFromGoogle`
  ensures every accountant has a `doc_collector` instance). `enabled=false`
  hides an instance; **never DELETE an instance row — clients cascade off it
  and the agent's data would be destroyed.**
- **Clients belong to an instance** — `clients.agent_instance_id` (NULL only
  on legacy CLI-era rows, treated as doc_collector). Per-agent scalar fields
  go in `clients.agent_fields` JSONB; relational per-agent data gets its own
  tables keyed by `client_id` (pattern: `client_documents`).
- **WhatsApp numbers are per instance** — `wa_senders.agent_instance_id`
  UNIQUE (migration 021): each agent instance that uses WhatsApp gets its own
  dedicated Twilio number, assigned by an admin (AdminDashboard agents section
  or `POST /api/admin/wa-senders`). Inbound routing is by the `To` number →
  instance; outbound `from` is the client's instance's number.

## Backend (`src/agents/`)

`AgentTypeDefinition` (types.ts):

- `conversationModel`: `'scheduled_follow_up'` (plan → draft → delayed BullMQ
  send; collectors), `'immediate_reply'` (support agents, reserved), `'none'`
  (periodic agents, reserved).
- `planNextAction(ctx)` — one planning step for one client. Runs inside
  `setFutureEmail`'s generic wrapper (complete/paused guards, drafting stamps,
  failure recording) — keep that contract.
- `onInboundMessage(ctx, evt)` — reaction after the shared webhook half
  (routing, dedupe, attachment/media ingestion) stored an inbound message.
- `analyzeInboundFile?(ctx, file, body)` — content analysis; absent = files
  marked `unsupported`.
- `buildRouter?()` — agent-specific API routes composed into the workspace
  router (guard on `req.agentInstance.agent_type`, `next('router')` otherwise).

Dispatch seams: `src/orchestration/setFutureEmail.ts` (generic dispatcher),
`src/webhook/onInbound{Email,WhatsApp}.ts` (reaction half),
`src/webhook/analyzeStoredFile.ts`, `src/agents/resolve.ts`
(`loadAgentContext(client)` → instance + definition + accountant).

Shared infrastructure (agent-agnostic, reuse as-is): Resend/Twilio transport,
`emails` messages table, BullMQ delayed-send queue + `scheduled_jobs` +
`withClientLock`, Azure blob storage, Gemini plumbing (`src/gemini/`), auth /
tenancy / admin impersonation / monday token auth.

## API

- `GET /api/agents` — caller's enabled instances.
- `/api/agents/:agentId/...` — the agent-scoped workspace (clients, emails,
  files, dashboard, SSE); `resolveAgentInstance` middleware sets
  `req.agentInstance` (404 on other users' or disabled instances).
- Legacy unprefixed `/api/clients...` mounts still exist and resolve to the
  user's doc_collector instance (removal is pending phase-6 cleanup).
- Same three shapes under `/api/monday/app/...` (monday sessionToken auth).
- Account-level (not agent-scoped): `/api/mailbox*` (`src/api/account.ts`).
  `/api/wa-sender` is agent-scoped (workspace router): the instance's own
  dedicated number.
- Admin: `GET/POST /api/admin/accountants/:userId/agents`,
  `DELETE .../agents/:agentType` (disable = flip `enabled`, never delete);
  `GET/POST /api/admin/wa-senders`, `DELETE /api/admin/wa-senders/:agentInstanceId`
  (per-instance number assignment).

## Frontend (`web/src/agents/`)

`AgentTypeUI`: `nameKey`/`descriptionKey` (i18n), `icon`, `clientTabs[]`
(id, labelKey, `render(ClientTabContext)`). The generic
`components/ClientView.tsx` owns load/SSE/poll/drafting logic and renders the
active type's tabs. Requests flow through `agentApi(agentId)` provided via
`WorkspaceApiContext` (`useWorkspaceApi()` in components; the default context
value is the legacy unprefixed `api`).

Shell behavior (`Workspace.tsx`): boots on `GET /agents`; one instance →
auto-enter (pre-agents UX); several → `AgentsHome` card grid + sidebar
switcher. A `pinnedAgentType` prop can lock a surface to one type; no surface
uses it today — the monday custom object was unpinned from `doc_collector`
once `customer_service` shipped, so it shows the same multi-agent shell as
the standalone app.

## Adding an agent type (checklist)

1. `src/agents/<type>/index.ts` — the `AgentTypeDefinition` (see
   `docCollector/` for the full shape, `debtCollector/` for the minimal stub).
2. Register in `src/agents/registry.ts` + add a Hebrew default name in
   `DEFAULT_INSTANCE_NAMES` (`src/db/queries/agentInstances.ts`).
3. `web/src/agents/<type>.tsx` — `AgentTypeUI` with tabs; register in
   `web/src/agents/registry.ts`; add `agent<Type>Name/Desc` strings to all
   three locales in `web/src/i18n.tsx`.
4. Per-client scalar fields → `agent_fields` JSONB; relational data → new
   tables keyed by `client_id` (own migration).
5. No migration needed for the type itself (`agent_type` is TEXT, validated in
   code). Enable it per accountant from the admin panel.

## Current state & deferred work

- `customer_service` is the first `'immediate_reply'` agent: an inbound-only
  WhatsApp Q&A agent. `onInboundMessage` fetches monday workdocs + board rows
  **live** (no caching) via a per-accountant OAuth token (`monday_oauth_tokens`,
  migration 020; connect flow in `src/api/mondayOauth.ts`), generates one
  answer, and sends it synchronously — nothing ever goes through the BullMQ
  scheduler (`planNextAction` is a no-op by design). Sender phone is the only
  authentication; board rows are re-verified server-side against the sender's
  number (`mondayData.ts` `phonesMatch`) before entering the prompt — the
  privacy boundary. The CS instance has its own dedicated WhatsApp number
  (`wa_senders`); unknown senders who message that number are auto-enrolled
  into the CS instance by the webhook (`onInboundWhatsApp.ts`) when it is
  enabled — messages to other agents' numbers never reach CS.
  Config lives in `agent_instances.settings`
  (`customerService/settings.ts`); the settings UI is the `settingsPanel`
  slot on `AgentTypeUI`, rendered in the workspace Settings view.
- `debt_collector` is a **stub**: `planNextAction` is a no-op — it never
  drafts or sends. Real implementation needs a prompt + decision schema +
  `client_debt` field, mirroring `docCollector/`.
- Deferred (unblocked by design, not built): removal of the legacy unprefixed
  mounts; per-agent prompt-template keys (`prompt_template.<agent_type>`,
  today the admin prompt editor edits the doc collector via the legacy key);
  inbound **email** fan-out when one accountant has the same client email in
  two agents (the 019 uniqueness relaxation to `(client_id, message_id)`
  already allows it — today routing picks the user-scoped match). The
  WhatsApp half of that ambiguity is resolved since migration 021: each
  number is dedicated to one instance, so the `To` number picks the agent.
  Also deferred: BullMQ repeatable-job queue for `'none'`-model periodic
  agents; per-agent LLM cost attribution (`llm_token_usage.agent_instance_id`).
