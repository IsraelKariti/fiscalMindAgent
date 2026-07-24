# Multi-agent platform architecture

Since 2026-07-11 (prod v11, migration 019) fiscalMind is a multi-agent
platform: one app hosting several developer-built agent types, each enabled
per accountant and owning its own client list. The document collector is
agent #1; `debt_collector`, `customer_service` and `annual_report_assistant`
are live too. Industry pattern followed: one app with an agent registry
(HubSpot Breeze / Salesforce Agentforce model) — never one app per agent.

## Concepts

- **Agent type** — behavior + UI defined in code. Backend half in
  `src/agents/<type>/`, frontend half in `web/src/agents/<type>.tsx`,
  registered in `src/agents/registry.ts` and `web/src/agents/registry.ts`.
- **Agent instance** — one row in `agent_instances` per (accountant, type),
  created by admin enablement only (`agentInstances.enableInstance`); new
  accounts start with zero agents. `enabled=false`
  hides an instance; **never DELETE an instance row — clients cascade off it
  and the agent's data would be destroyed.**
- **Clients belong to an instance** — `clients.agent_instance_id` (NULL only
  on legacy CLI-era rows, treated as doc_collector). Per-agent scalar fields
  go in `clients.agent_fields` JSONB; relational per-agent data gets its own
  tables keyed by `client_id` (pattern: `client_documents`).
- **WhatsApp numbers are per instance** — `wa_senders.agent_instance_id`
  UNIQUE (migration 021): each agent instance that uses WhatsApp gets its own
  dedicated Twilio number, assigned by an admin (AdminDashboard agents section
  or `POST /api/admin/wa-senders`). The admin panel can also auto-buy one
  (`POST /api/admin/wa-senders/provision`, `src/twilio/provision.ts`): it
  purchases a US number and registers it as a WhatsApp sender under
  `TWILIO_WABA_ID` — no Twilio-console step. Inbound routing is by the `To`
  number → instance; outbound `from` is the client's instance's number.

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
- Account-level (not agent-scoped): `GET /api/mailbox` (`src/api/account.ts`)
  — read-only status of the legacy account mailbox; there is no
  accountant-facing claim anymore (addresses are per-instance and
  admin-assigned; grandfathered instances without one still send from the
  account mailbox — `resolveSenderMailbox` in `src/agents/instanceEmail.ts`
  encodes that fallback). `/api/wa-sender` is agent-scoped (workspace router):
  the instance's own dedicated number.
- Admin: `GET/POST /api/admin/accountants/:userId/agents`,
  `DELETE .../agents/:agentType` (disable = flip `enabled`, never delete).
  Activation of a type that emails clients (has `emailSuffix`) is email-gated:
  the first enable must carry `emailLocalPart` (the admin picks it with the
  accountant in the activation modal; a re-enable keeps the existing address).
  There is deliberately NO auto-derivation of instance sender addresses
  anywhere — `POST /api/admin/agent-emails` (also modal-confirmed in the UI)
  is the only other way an instance gets or changes its address;
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

## Doc-collector lifecycle (completion & due date)

- **Goal complete** (every required document collected): the agent stops
  (guards in `setFutureEmail`/`sendEmailWorker`) and emails the accountant —
  `docCollector/notifyAccountant.ts`, sent from a no-reply platform address
  to their login address, deliberately *not* stored in `emails` (that table is
  the client conversation). Both completion paths notify: the LLM plan
  (`plan.ts`) and the manual documents toggle (`router.ts`). No closing
  message is sent to the client.
- **Due date passed** (`agent_fields.due_date`, "YYYY-MM-DD"): the
  `overdue_scan` BullMQ queue (daily job scheduler at 00:10 local +
  a catch-up scan on worker boot, `docCollector/overdueScan.ts`) pauses the
  client and emails the accountant the missing documents — the client is
  handed off. Two `agent_fields` markers: `overdue_notified_at` (idempotency —
  cleared only by a due-date edit) and `overdue_stopped_at` (the "handed off"
  UI state — cleared on resume or due-date edit). Resuming, or editing the due
  date (`PUT /clients/:id/due-date`, doc-collector router), puts the agent
  back to work; manually paused clients are never overdue-stopped.

## Doc-collector tax-authority 106 fetch (browser automation)

The doc collector can fetch a client's Form 106 (טופס 106) straight from the
Israeli tax authority by driving a real browser, entirely as a **conversational
capability** — there is no accountant button.

- **Flow**: the LLM offers the fetch in the email thread when a pending required
  document matches `/106/` and credentials are on file; on agreement it explains
  the SMS-code step and asks the client to confirm they're free. `start_login`
  only becomes an allowed action once the client has replied **after** that
  intro (`clientRepliedSinceIntro`, computed in `loadTaxFetchContext` from the
  last inbound timestamp vs. the session's `updated_at`) — the post-send re-plan
  runs with no new client input and must never be able to trigger the OTP SMS.
  The login job is then enqueued delayed to the heads-up message's send time and
  the runner verifies that message's row is `sent` (bounded re-checks; an
  abandoned draft never sends → the login never runs), so the tax authority's
  OTP SMS can't precede the WhatsApp message warning about it. The first
  WhatsApp message is prompted to read as a continuation of the email thread
  (prefer a dedicated 106 template when the 24h window is closed). The client's
  WhatsApp reply with the code is intercepted (`taxFetch/inboundOtp.ts`, before
  the LLM re-plan — OTPs expire in minutes), the worker submits it, downloads
  the PDF, sends it to the client over WhatsApp and stores it as a
  `document_files` row with the matching `client_documents` row marked
  collected.
- **State machine**: `tax_fetch_sessions` (migration 025) tracks one attempt
  offer→delivery; the LLM only ever sees the actions valid in the current state
  (`allowedTaxFetchActions` in `decisionSchema.ts`, gated in the prompt's
  `buildTaxFetchSection` and re-validated in `normalizeDecision` via the new
  `tax_fetch_action` decision field). `taxFetch/flow.ts` loads state + acts.
- **Where the browser lives**: the worker, in an in-memory session manager
  (`src/browser/sessionManager.ts`) keyed by session id, driven by the
  `tax_fetch` BullMQ queue (`start_login` / `submit_otp` / `cancel`). The live
  Playwright page is held between the login and OTP jobs; a TTL
  (`TAX_FETCH_SESSION_TTL_MS`) closes it if the OTP never arrives, and a
  worker-boot sweep marks orphaned sessions `expired`. The web process never
  touches Playwright.
- **Providers**: `src/browser/providers/` is provider-structured
  (`DocumentFetchProvider`) so other sites can be added; today only
  `israel_tax_authority`. `TAX_FETCH_MOCK=true` swaps in a no-browser mock (every
  real login SMSes a real citizen — iterate on the mock). `scripts/taxFetchSmoke.ts`
  validates the real-site port once, interactively.
- **Credentials**: `client_portal_credentials` (migration 025, plaintext, same
  precedent as the OAuth token tables), imported from the accountant's
  boards/sheets via the shared client-import mapping (two optional columns:
  national ID + permanent user code), synced for new *and* existing clients.
- **WhatsApp media**: `sendWhatsAppMedia` + a signed, expiring public link
  (`src/storage/mediaUrl.ts` + `GET /media/:token`, `MEDIA_SIGNING_SECRET`),
  since Twilio fetches media server-side and blobs are otherwise private.
- **Deferred (prod)**: the worker Docker image is still Alpine; running the
  headful browser in prod needs a Playwright/Debian base + Xvfb (worker image
  only — keep Chromium out of the web image).

## Current state & deferred work

- `customer_service` is the first `'immediate_reply'` agent: an inbound-only
  WhatsApp Q&A agent. `onInboundMessage` fetches its knowledge sources
  **live** (no caching), generates one answer, and sends it synchronously —
  nothing ever goes through the BullMQ scheduler (`planNextAction` is a no-op
  by design). Two source families, each behind its own per-accountant OAuth
  connection:
  - **monday**: workdocs (office knowledge) + board rows (client records),
    via `monday_oauth_tokens` (migration 020; connect flow in
    `src/api/mondayOauth.ts`). monday tokens never expire.
  - **Google**: Docs (office knowledge) + Sheet rows (client records), via
    `google_oauth_tokens` (migration 022; connect flow in
    `src/api/googleOauth.ts`). Scope is `drive.file` only — the accountant
    picks specific files in the Google Picker popup
    (`web/google-picker.html`), and the app can read only those. Google
    access tokens expire ~hourly; `getFreshGoogleAccessToken()` refreshes
    from the stored refresh token before every read.

  Sender phone is the only authentication; board and sheet rows are
  re-verified server-side against the sender's number (`mondayData.ts`
  `phonesMatch`, shared by `googleData.ts`) before entering the prompt — the
  privacy boundary. The CS instance has its own dedicated WhatsApp number
  (`wa_senders`); unknown senders who message that number are auto-enrolled
  into the CS instance by the webhook (`onInboundWhatsApp.ts`) when it is
  enabled — messages to other agents' numbers never reach CS.
  Config lives in `agent_instances.settings`
  (`customerService/settings.ts`); the settings UI is the `settingsPanel`
  slot on `AgentTypeUI`, rendered in the workspace Settings view.
- `annual_report_assistant` is the doc collector's autonomous sibling
  (`src/agents/annualReport/`): no accountant-defined document list — clients
  are added name+email only (`simpleClientForm`), and the agent interviews the
  client (annual personal return, טופס 1301/135: triage שכיר/עצמאי, capital
  income, proactive credits). Documents it determines become ordinary
  `client_documents` rows via the decision field `add_documents` (deduped by
  normalized name; `matched_file_id` lets a volunteered file create the row
  already collected), so the collection machinery is shared. Completion is
  derived, never trusted from the LLM: sticky `agent_fields.interview_complete`
  AND ≥1 document AND none pending — zero rows can never complete. Checking
  every box in the documents tab is an accountant override (stamps the
  interview flag too). Reuses docCollector's `getWaChannelState`, prompt
  section builders, `analyzeInboundFile` and `sendToAccountant` via cross-dir
  imports; has its own prompt template and deliberately does NOT honor the doc
  collector's per-user custom template. The overdue scan covers both types
  (`clients.listOverdueForAgentTypes`).
- **Client-import sources** (doc collector + annual-report assistant): the
  accountant links monday boards / Google Sheets (email + optional name
  column, per-instance in `agent_instances.settings`) and every row that isn't
  a client yet is enrolled — immediately via the settings panel's "import now"
  (`POST /client-sources/scan`) and by a daily sweep (queue
  `client_import_scan`, 00:50 local + boot catch-up). Shared machinery lives
  in `src/agents/shared/`: `clientSources.ts` (source schemas + whole-source
  sweep + candidate collection — the debt collector's settings/scan now build
  on it too), `clientImportScan.ts` (enroll-all scan; no LLM screening),
  `clientSourcesRoutes.ts` (the `/client-sources/*` routes both agents mount).
  The doc collector additionally keeps a `documents` checklist in its settings
  (`docCollector/settings.ts`) — every imported client is created with it, and
  the import refuses to run while the checklist is empty (a document-less
  client would complete trivially). Web: `ClientSourcesSettings.tsx` is the
  shared panel (connections, board/sheet pickers, optional documents editor +
  import-now); `DebtCollectorSettings.tsx` is now a thin wrapper around it.
- Deferred (unblocked by design, not built): removal of the legacy unprefixed
  mounts; per-agent prompt-template keys (`prompt_template.<agent_type>`,
  today the admin prompt editor edits the doc collector via the legacy key);
  inbound **email** fan-out when one accountant has the same client email in
  two agents (the 019 uniqueness relaxation to `(client_id, message_id)`
  already allows it — today routing picks the user-scoped match). The
  WhatsApp half of that ambiguity is resolved since migration 021: each
  number is dedicated to one instance, so the `To` number picks the agent.
  Also deferred: BullMQ repeatable-job queue for `'none'`-model periodic
  agents.
- Per-agent LLM cost attribution shipped with migration 023: `llmUsage.add`
  writes both the lifetime `llm_model_usage` counters and a daily
  `llm_usage_daily` bucket per (day, accountant, agent instance, model), days
  bucketed in `ACCOUNTANT_TIMEZONE`. `GET /api/admin/llm-usage/daily?days=N`
  returns the priced cube; the admin `#/usage` page (AdminUsage.tsx) charts it
  with client-side grouping (accountants / agent types) and filters. Every new
  Gemini call site must pass its agent instance id to `llmUsage.add`.
