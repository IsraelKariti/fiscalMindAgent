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
- **Agent instance** — one row in `agent_instances` per (accountant, type).
  The doc collector is the default — and only — out-of-the-box agent: a
  whitelisted account with zero instance rows (enabled or not) gets an enabled
  `doc_collector` on first app load (`ensureDefaultDocCollector` in
  `src/api/auth.ts`, audited as `agent.auto_provisioned`; no sender address —
  an admin still assigns that). Every other type is admin-enabled only
  (`agentInstances.enableInstance`). `enabled=false`
  hides an instance; **never DELETE an instance row — clients cascade off it
  and the agent's data would be destroyed.**
- **Kill switches** — `agent_instances.enabled` is re-checked at act time
  wherever work runs deferred (queued sends in `sendEmailWorker`, tax-fetch
  jobs in the runner), not only on inbound webhooks and daily scans, so
  disabling an agent also drains its in-flight work. The org-wide emergency
  stop is the `platform_kill_switch` app-setting (`src/agents/killSwitch.ts`,
  admin Settings page, `GET/PUT /api/admin/kill-switch`): when on, inbound
  webhooks, queued sends, tax fetches and the daily scans all stop, with no
  deploy or restart. New deferred/scheduled execution paths must call
  `agentWorkBlocked` (or at least `isKillSwitchOn`) before acting.
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

Shell behavior (`Workspace.tsx`): boots on `GET /agents` and always
auto-enters an agent — the remembered one, else the `doc_collector` instance
(the product's core agent), else the first. The `AgentsHome` card grid is
not accountant-reachable anymore (no landing page, no sidebar item) — it
survives only as the none-enabled message for agent-less accounts and as
the coming-soon pane's back target. A
`pinnedAgentType` prop can lock a surface to one type; no surface uses it
today — the monday custom object was unpinned from `doc_collector` once
`customer_service` shipped, so it shows the same shell as the standalone app.

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

- **Flow**: the LLM offers the fetch when a pending required document matches
  `/106/` and credentials are on file; on agreement it explains the code step
  (the tax authority emails the client a one-time code, which the client relays
  back on WhatsApp). The action ladder is deliberately loose (2026-07-25): the
  model judges when to offer/agree/start, and the code keeps only the hard
  gates. `start_login` is allowed in any non-mid-flight state, but **only while
  the conversation is live on WhatsApp** (`clientOnWhatsapp` in
  `loadTaxFetchContext`: channel allowed + 24h window open + an inbound WhatsApp
  message exists — email is spoof-adjacent and must never be able to arm the
  login, which fires a real OTP email at the client). On `start_login` with no
  pre-login session in flight (first time, or retry after failed/expired),
  `flow.ts` creates a fresh session directly at `wa_intro_sent`.
  The login job is then enqueued delayed to the heads-up message's send time and
  the runner verifies that message's row is `sent` (bounded re-checks; an
  abandoned draft never sends → the login never runs), so the tax authority's
  OTP email can't precede the WhatsApp message warning about it. The first
  WhatsApp message is prompted to read as a continuation of the email thread
  (prefer a dedicated 106 template when the 24h window is closed). The client's
  WhatsApp reply with the code is intercepted (`taxFetch/inboundOtp.ts`, before
  the LLM re-plan — OTPs expire in minutes), the worker submits it, downloads
  the year's 106 for **every employer** (the site lists one להצגת טופס 106 link
  per employer; the provider scrapes each row's employer name — exactly as the
  site spells it — and captures each PDF from the blob: viewer popup the click
  opens), plus the year's all-employers **salary summary** (ריכוז נתוני שכר)
  when the site offers one (`kind: 'salary_summary'` — an employer link sits
  alone in its own `div.row`, the summary link's nearest row is the container
  holding the whole employer table), and stores each as its own
  `document_files` row, labeled `טופס 106 — <employer>` /
  `ריכוז נתוני שכר מכלל המעסיקים <year>` (`label` column, migration 035), all linked to the one
  matching `client_documents` row, which is marked collected. The workspace
  documents card lists every labeled file under the checklist item with its own
  view/download buttons. The client's copies go by **email attachment** (never
  WhatsApp media — possession of the phone number must not be enough to receive
  the document); the WhatsApp conversation only gets a confirmation text. A
  client with no email address / sender mailbox gets the platform copy only.
- **State machine**: `tax_fetch_sessions` (migration 025) tracks one attempt
  offer→delivery; the LLM sees every mechanically-possible action in the
  current state (`allowedTaxFetchActions` in `decisionSchema.ts`, shown in the
  prompt's `buildTaxFetchSection` and re-validated in `normalizeDecision` via
  the `tax_fetch_action` decision field). The hard guards that remain: no
  action at all after `delivered` (never re-fetch), `cancel` only while a live
  browser session is mid-flight, offer/login require `available`, and
  `start_login` requires `clientOnWhatsapp` (above). The prompt explains each
  action's mechanics and tells the model to keep action and message text
  consistent. `taxFetch/flow.ts` loads state + acts.
- **Where the browser lives — secret isolation**: NOT in the worker. Real
  fetches run in the browser-runner sidecar (`src/browserRunner.ts`, own
  process/container), which holds no platform secrets — its env
  (`src/browserRunner/env.ts`, never `src/config/env.ts`) is only its port,
  the shared bearer token and the TTL, so a compromised page (Chrome exploit
  on the external site) can't reach `DATABASE_URL`, `SECRET_ENC_KEY` or any
  API key. The worker drives it over HTTP (`taxFetch/fetchClient.ts` →
  `BROWSER_RUNNER_URL` + `BROWSER_RUNNER_TOKEN`), keeps only bookkeeping in
  memory (`taxFetch/sessionTracker.ts`), and treats responses as untrusted
  (size cap, content-type allowlist, filename sanitization). Jobs still flow
  through the `tax_fetch` BullMQ queue (`start_login` / `submit_otp` /
  `cancel`); the live page is held in the runner between the login and OTP
  jobs. TTLs: the worker's timer (`TAX_FETCH_SESSION_TTL_MS`) expires the
  session and messages the client; the runner reaps orphaned browsers a grace
  period later; a worker-boot sweep marks orphaned DB rows `expired`. Keep
  `src/browserRunner/` free of imports from worker/web code — pulling in
  `config/env.ts` would defeat the isolation.
- **Providers**: `src/browserRunner/` is provider-structured
  (`DocumentFetchProvider` in `providerTypes.ts`) so other sites can be added;
  today `israel_tax_authority` (Form 106), `altshuler_shaham` (pension/study-fund
  annual report + tax certs) and `harel` (study-fund annual reports — downloads
  every doc under תחום גמל והשתלמות for the year, all result pages; a worker-side
  spec in `taxFetch/providers.ts` mirrors each). `TAX_FETCH_MOCK=true` swaps in an
  in-worker no-runner mock (`fetchClient.ts` — every real login emails a real
  citizen an OTP, so iterate on the mock). `scripts/taxFetchSmoke.ts` validates the
  real-site port once, interactively (no token/runner needed).
- **Credentials**: `client_portal_credentials` (migration 025, plaintext, same
  precedent as the OAuth token tables), imported from the accountant's
  boards/sheets via the shared client-import mapping (two optional columns:
  national ID + permanent user code), synced for new *and* existing clients.
- **WhatsApp media (outbound infra, currently unused)**: `sendWhatsAppMedia` +
  a signed, expiring public link (`src/storage/mediaUrl.ts` +
  `GET /media/:token`, `MEDIA_SIGNING_SECRET`), since Twilio fetches media
  server-side and blobs are otherwise private. The 106 flow stopped using it —
  documents go to clients by email attachment only (see above).
- **Prod**: `Dockerfile.browser-runner` (Playwright/noble base, Chrome
  channel, Xvfb, non-root) is the only image with a browser — web/worker stay
  Alpine. Two runner modes (`TAX_FETCH_RUNNER_MODE`, `fetchClient.ts`):
  - `static` (local dev): one long-lived runner process at
    `BROWSER_RUNNER_URL`, with ONLY
    `BROWSER_RUNNER_PORT`/`BROWSER_RUNNER_TOKEN`/`TAX_FETCH_SESSION_TTL_MS` in
    its env.
  - `aci` (prod): the tax authority drops non-Israeli source IPs (and only
    some Azure Israel ranges pass its filter), so each session gets its own
    throwaway Azure Container Instance (`taxFetch/aciSessionPool.ts`) in the
    `fiscalmind-israel` RG's `aci-sessions` subnet, whose NAT gateway holds a
    static egress IP verified against the site. Group names derive from the
    session id (worker restarts re-find containers via ARM — no DB state);
    containers are deleted on download/close/expiry, with a 15-min orphan
    sweep as backstop. The worker's managed identity has Contributor on that
    RG; image pulls use an AcrPull user-assigned identity
    (`TAX_FETCH_ACI_ACR_IDENTITY_ID`). The Israel vnet is peered to the
    Poland vnet, so the worker reaches session containers on private IPs.
    Capacity: `sessionTracker` caps at 100 (`TAX_FETCH_MAX_LIVE_SESSIONS`);
    the tax-fetch queue runs concurrency 8 in this mode.

## Prompt-injection defenses (content-level)

All untrusted content (email subject/body, WhatsApp text, file bytes and the
analyses derived from them, sheet/board cells, monday docs) is treated as
hostile on its way into any LLM prompt. Three layers, all mandatory when
touching prompt builders or planners:

- **Structural** (`src/agents/shared/promptSafety.ts`): every data section is
  delimited by per-call nonce fences (`--- NAME [a1b2c3d4] ---` via
  `makeFenceToken`/`fence`/`endFence`) so content can't forge a boundary it
  can't name; every untrusted string passes `sanitizeUntrusted`/`sanitizeInline`
  (strips bidi/zero-width/control chars, defangs `---`/`===`/``` ``` ``` runs,
  caps length); an untrusted-data doctrine (`buildUntrustedDataDoctrine`) is
  appended to every agent's system instruction **outside** any
  accountant-editable template; inbound messages that trip the regex heuristics
  (`detectInjectionHeuristics`, also logged at ingestion in the webhooks) get a
  SECURITY NOTE annotation in the transcript. Every planner schema carries
  `suspected_injection` — when the LLM sets it, that cycle's state changes are
  suppressed (and tax-fetch actions except `cancel` are dropped).
- **Analyzer isolation + quarantine** (`analyzeFile`/`analyzeReceipt`): the
  file analyzers see only the file bytes (never the conversation), are told
  the file is untrusted, report `injection_suspected`, and their
  `matched_document_id` is validated against the real list at write time.
  Quarantined files (`isQuarantined` in `src/agents/shared/fileEvidence.ts`:
  suspected or illegible) render as an explicit warning in transcripts, are
  never linked to documents, and never count as evidence; the workspace files
  card shows a "תוכן חשוד" badge.
- **Authority reduction** — LLM verdicts alone can't flip consequential state:
  - Doc collector / annual report: `collected` requires file evidence — the
    analyzer's own match (tier A, `fileMatchesDocument`) or a planner pairing
    with a verified legible file (tier B, `isVerifiedLegibleFile`). A no-file
    claim ("delivered by fax / in person") becomes status **`claimed`**
    (migration 030) + a confirm-request email to the accountant; only the
    accountant's click (documents-tab checkbox → `collected`) completes it.
    Goal completion counts only `collected`.
  - Debt collector: `paid` is authoritative only when the extraction says the
    accountant's own rows are clean (`in_debt=false`, i.e. the row was
    cleared). Otherwise the snapshot becomes **`paid_claimed`**: dunning stops,
    the accountant gets a confirm-request email (idempotent via
    `paid_claim_notified_at`), and either their confirmation
    (`POST /debt-collector/clients/:id/confirm-paid`, button in the debt tab)
    or clearing the source row completes the goal. `no_debt` under
    `suspected_injection` records the snapshot but leaves the goal open.
  - Tax fetch: `start_login` requires a live WhatsApp conversation — an email
    alone can never arm it (see the 106-fetch section above).

Tests for the pure helpers live in `tests/` (`npm test`, node:test via tsx).

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
  by the webhook (`onInboundWhatsApp.ts`) **only if their number matches a
  row in the connected client records** (`enrollGate.ts`
  `isListedClientPhone`, same phonesMatch check; fail-closed — no sources
  configured or a lookup error means no enrollment). Unlisted strangers get
  silence: no client row, no LLM call. Messages to other agents' numbers
  never reach CS.
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
  already collected — only when that file's analysis is verified, see the
  prompt-injection section), so the collection machinery is shared. Completion is
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
  a client yet is enrolled — immediately via the settings panel's per-source
  "import now" (`POST /client-sources/scan`, optional `source` body narrows
  the sweep to one board/sheet) and by a daily sweep (queue
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
- **Audit trail + anomaly detection** (migrations 031-032): `audit_events` is
  the per-action forensic record — one row per outbound email/WhatsApp,
  tax-authority login/OTP/delivery, LLM-driven status change
  (collected/claimed/goal-complete/debt statuses), injection-suppressed
  planning cycle, auto-enrollment, accountant override and mutating admin API
  call. **Every new outward-facing or state-changing action site must call
  `recordAudit`** (`src/audit/audit.ts`, fire-and-forget — it never fails or
  slows the action), the same way every Gemini call site must call
  `llmUsage.add`. Two deliberate deviations from house conventions, both
  because audit history must outlive what it describes: the user/instance/client
  id columns have NO foreign keys (migration 036 — FK cascades would trip the
  append-only trigger, and keeping the historical id beats nulling it; labels
  live in `detail` JSONB), and it carries the repo's only DB trigger, which
  makes it append-only at the database layer (`auditEvents.ts` is insert+read
  only — never add update/delete functions).
  Admin mutations are recorded centrally from `requireAdmin`
  (`src/audit/adminAudit.ts`), attributed to `req.realUserId` so impersonation
  attributes to the real admin; request bodies pass through `redactForAudit`
  (`src/audit/redact.ts`, pure + tested). Detection is two-tier: `critical`
  audit events (injection suppression, kill-switch flips, whitelist grants)
  alert at event time from `recordAudit`, and the `anomaly_scan` queue
  (every 15 min, `src/alerts/anomalyScan.ts` over pure rule evaluators in
  `anomalyRules.ts`) sweeps for send-volume/enrollment/token spikes, repeated
  tax-fetch failures and off-hours tax logins. Findings land in
  `anomaly_alerts` (deduped per rule+scope by `insertIfNotRecent`) and email
  the DB-managed admins (`users.is_admin`, falling back to `ADMIN_EMAILS`
  before the one-time bootstrap has seeded any) via
  `src/alerts/adminAlert.ts` — the platform's only admin-facing email path. Alerts + the raw trail are on the admin `#/audit`
  page (AdminAudit.tsx); the dashboard shows only the open-alert count badge.
  Two intentional kill-switch exceptions, per the flag-and-notify doctrine
  (detection never auto-acts): `recordAudit` and the anomaly scan are NOT
  kill-switch-gated — they are the layer that must keep seeing during an
  incident.
