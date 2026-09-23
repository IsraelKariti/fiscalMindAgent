# Multi-agent platform architecture

Since 2026-07-11 (prod v11, migration 019) fiscalMind is a multi-agent
platform: one app built to host several developer-built agent types, each
enabled per accountant and owning its own client list. **Since 2026-09-11 it
hosts exactly one agent type, `declaration_of_capital`**
(`src/agents/declarationOfCapital/`, UI `web/src/agents/declarationOfCapital.tsx`):
a WhatsApp collector of the documents a הצהרת הון needs as of the
31.12.tax_year valuation date. The registries, the per-instance client model,
the admin activation flow and the `AgentTypeDefinition`/`AgentTypeUI` seams
stay generic so another type can be added, but nothing else is registered.

History: the document collector (`doc_collector`, agent #1 — the annual
tax-return checklist chased over email/WhatsApp) was the engine the
declaration-of-capital collector was built on (2026-08-18, as a
"doc-collector-family" type spreading its definition); `debt_collector`
(email dunning over office sheets/boards) and `customer_service` (inbound
WhatsApp Q&A over monday docs/boards + Google Sheets/Docs) shipped 2026-07-13,
alongside nine coming-soon stubs. All of them were removed 2026-09-11:
migration 055 disabled their `agent_instances` rows (rows are never deleted),
the doc collector's engine (planner, decision schema, file analyzer, documents
router, overdue scan, tax-authority fetch) moved wholesale into
`declarationOfCapital/`, and the doc-collector-only surfaces went with it —
the accountant-editable prompt template (admin prompt editor +
`/prompt-template` routes + `user_settings`), the (since-removed) monday-widget board→clients
import (`POST /api/monday/clients/import`), the legacy unprefixed workspace
mounts (`/api/clients…` resolving to the user's doc_collector instance) and the
CLI bootstrap script. The monday/Google row fetchers the customer-service
agent owned live on as `src/agents/shared/mondayData.ts` / `googleData.ts`
(client-import sources, kickoff webhook, board status sync).

The agent is **WhatsApp-only**
(`AgentTypeDefinition.whatsappOnly`; it has no `emailSuffix` anymore, so
activation is not email-gated and no mailbox is required — the instance's
`wa_senders` number is what it sends from):
- Clients are keyed by **phone**, not email: the source mapping's required key
  column is the phone column (`ClientSourcesSettings keyKind="phone"`, board
  picker filtered by `PHONE_CAPABLE`), `collectCandidates(sources, 'phone')`
  dedupes by the E.164 number, the import looks rows up via
  `getByWaPhoneForInstance`, and `email_address` gets the synthetic
  `wa-<digits>@wa.invalid` placeholder (`src/util/syntheticEmail.ts`, same
  pattern; the UI hides it, tax-fetch delivery treats it
  as "no email"). The kickoff webhook resolves the clicked row by its phone
  cell the same way.
- The import gate is a **WhatsApp sender**, not a mailbox
  (`notReady: 'no_wa_sender'`), and sources without a mapped phone column
  refuse to enroll (`'no_phone_column'`).
- The planner may never choose email: `DecisionContext.emailAllowed=false`
  rejects it in `normalizeFollowUpMessage`, and `planFollowUp` throws upfront
  when the WhatsApp channel is unavailable (no opt-in / no sender / window
  closed with zero approved templates) instead of asking the LLM. First
  contact always goes out as an **approved template** (the 24h window is
  closed until the client first replies); the prompt tells the model to send
  the full intake questionnaire as its first free-form message once the
  window opens. Operational prerequisite: at least one approved `wa_templates`
  row must exist (admin: waAdmin routes) or the agent cannot start
  conversations.
It is also a **manual-kickoff** type (`AgentTypeDefinition.manualKickoff`):
the client-import scan enrolls its clients *paused* with no first draft, and
the first message is drafted+scheduled only on an explicit accountant trigger —
either the **monday kickoff webhook** (`src/webhook/mondayKickoffRoute.ts`:
`POST /webhooks/monday-kickoff/:instanceId/:token`, token HMAC-derived from
`SECRET_ENC_KEY` so nothing is stored in the wholesale-replaced settings JSONB;
the URL shows in the client-sources settings panel and the accountant pastes it
into a monday Webhooks-integration recipe, e.g. "when button clicked, send a
webhook" on the client board) or the workspace resume toggle. The webhook is
event-type-agnostic (any event with a `pulseId` works), resolves the row's
email via the board's configured email column, enrolls a not-yet-imported row
on the spot (narrowed scan), and only starts a paused, never-contacted,
goal-open client — repeat fires are acknowledged (200) and ignored. Each start
is audited as `client.kickoff_triggered`.
Since 2026-08-24 the declaration flow is **questionnaire-driven** (the office's
monday WorkForm is the only source of which documents a declaration needs):
- **Board shape**: the declarations board maps four extra columns
  (`BoardSourceSchema`: `crmLinkColumnId`, `formLinkColumnId`,
  `fileNumberColumnId`, `yearColumnId`; settings UI
  `withDeclarationColumns`). The two link columns are **connect-boards**
  columns: one to the client's CRM item (phone / name / ת"ז live there — the
  declarations row itself needs no phone column any more), one to the
  submitted WorkForm response item (its columns ARE the form answers). The
  webhook recipe fires on form submission (e.g. "when the questionnaire status
  changes to התקבל מענה").
- **Kickoff resolution** (`declarationOfCapital/kickoff.ts`,
  `fetchItemDetails` in `shared/mondayData.ts` reads titles/types +
  `BoardRelationValue.linked_item_ids`): the webhook follows the CRM link for
  the phone (first phone-typed column, title-pattern fallback; the ת"ז cell
  — recognised by `crmIdentity.ts` `crmIdNumber`: Hebrew titles `מספר זהות` /
  `תעודת זהות` / `זהות` / `ת"ז` in any punctuation, English `id` / `id number`
  / `national id` / `identity` as words, never `item|board|monday|pulse`
  titles, ≥ 5 digits, checksum-valid candidate preferred — feeds
  `agent_fields.id_number`, used by verification after the tax-portal
  credentials; a client with neither but a linked CRM card gets the card
  fetched once at verification and the id stored, openspec
  `declaration-kickoff`), enrolls the phone-keyed client on the spot, and stamps the
  engagement identity — **file number + declaration year** — plus the linked
  item ids into `agent_fields` (`file_number`, `tax_year`,
  `monday_crm_item_id`, `monday_form_item_id`).
- **Per-client tax year, no instance fallback**: the year comes exclusively
  from the board row (`yearColumnId`) — `capitalClientTaxYear`
  (shared/taxYear.ts) reads `agent_fields.tax_year` everywhere (checklist
  seeding, prompts, verification's 31.12 check). `collectsTaxYear=false` hides
  the admin field for this type; a row without a parseable year is not started
  by the kickoff, and the daily import scan no longer enrolls catalog-seeded
  types at all (kickoff-only enrollment — the scan cannot know a row's year).
- **Form pre-resolution** (`declarationOfCapital/formIntake.ts`, rules in
  `formIntakeRules.ts`): before the first draft is planned, one isolated
  Gemini read maps the form's question/answer pairs onto the seeded
  `unresolved` rows — explicit "no" answers become `not_required` with a new
  evidence shape (`{source:'form', question, quote}`, quote validated verbatim
  against the answers), concrete assets become 1..N `pending` rows (same
  `resolveRequired` splitting as the interview), and empty/ambiguous answers
  stay `unresolved` so the WhatsApp interview asks **only the gaps** (the
  prompt tells the model the questionnaire was already processed; when nothing
  is left unresolved it skips the interview and goes straight to collection).
  The answered pairs are also persisted (sanitized) as
  `agent_fields.form_answers` at kickoff and rendered each turn as the
  fenced `SUBMITTED QUESTIONNAIRE` prompt section, so a clarify question for
  a row an ambiguous answer left `unresolved` is phrased as a targeted
  follow-up to what the client wrote ("you mentioned withdrawing the funds —
  was the fund closed before 31.12?") instead of the catalog's blank-slate
  discovery question; the form text itself can never serve as resolution
  evidence (quotes must come from inbound messages).
  Suspected injection in the answers suppresses all resolutions; every applied
  resolution is audited as `document.resolved` with `source: 'form_intake'`.
  The catalog was realigned to the form (17 types): added
  `contents_insurance`, `poa_account`, `private_investment`; removed
  `cash_foreign_currency`, `valuables`, `foreign_assets` (foreign
  banks/portfolios fold into `bank_balance`/`securities_portfolio`, residual
  assets into `other_assets`).
- **Requirements ladder** (2026-08-25, migration 050; born from the office's
  real-estate spec but type-generic): a resolved type's document set can change
  mid-conversation, via two evidence-gated planner actions validated in
  `decisionSchema.ts` and applied in `plan.ts` — `added_instances` inserts
  sibling `pending` rows next to any already-resolved row of a multi-instance
  type (`clientDocuments.addInstances`; also covers "actually there's a third
  account"), and `retired_documents` retires rows the ladder replaced
  (status **`retired`** — migration 053 renamed it from `superseded` — `clientDocuments.retire`, requires a verbatim
  client quote; valid even from collected/approved per the office's unit rule —
  contract + payments appendix stand or fall together). Retired rows are out
  of the goal everywhere `not_required` is (plan/router settle checks,
  dashboard SQL, web UI where they render as a collapsed group with the quote)
  and are hidden from the planner's REQUIRED DOCUMENTS section entirely; the
  accountant can reopen them to pending. Every instance (resolution or
  addition) also carries **`already_provided`**: when the client says the
  office already holds a document — from a prior office-made declaration or
  any earlier delivery — the row is born `claimed` (trust the client; the
  accountant confirms), feeding the same claimed-documents notification. The
  real-estate branching itself (purchase contract + appendix → assessment +
  Tabu with self-service portal links → signed cost declaration with 4
  mandatory fields; contractor payments-status report; probate order + Tabu
  for inheritance; current Tabu only for gifts; office-held prior-declaration
  properties as `already_provided`) lives in the catalog's `real_estate`
  description + `prompt.md`'s special-case block.
- **Vehicle spec** (2026-08-31; the office's vehicle matrix): every vehicle
  needs a valid (unexpired) vehicle-license copy plus a purchase
  document/receipt, falling back to a client cost declaration when neither
  exists — encoded in the catalog's `vehicle` entry, `prompt.md`'s
  special-case block (two instances per vehicle; the receipt →
  cost-declaration swap reuses the ladder actions) and form intake's special
  keys. Two new optional catalog fields, both type-generic and seeded from a
  real license sample: `analysisHintHe` — document anatomy + lookalike traps
  for the file-reading models only (ingestion classification + verification
  extraction; e.g. the license's "valid until" header field, the bottom
  renewal/payment slip of the page not being the license) — and
  `checks.notExpired` — the verification extractor also pulls the document's
  own validity date (`valid_until`), and `runChecks` deterministically fails
  a well-formed date that is past at verification time; sibling instances of
  the same type carrying no validity date (receipt, cost declaration) are
  unaffected.
- **Spouse identity** (2026-09-23; openspec `spouse-identity`): a client
  has at most ONE spouse on file — `agent_fields.spouse = {name, id_number,
  name_source, id_source}` (sources `questionnaire` > `crm` > `document`)
  plus `agent_fields.marital_status` (`married` / `not_married`; absent =
  unknown), no migration. `spouseIdentity.ts` owns the record (`readSpouse`,
  `mergeSpouse` — a present value is replaced only by a strictly
  higher-trust source, never cleared) and the pure identity rule
  `resolveSubjectIdentity` that `runChecks` calls for the `subject` /
  `id_matches_client` / `spouse_adopted` / `client_id_on_file` entries:
  printed id = client → client; = spouse on file → spouse; otherwise, with
  the client's id on file, the id is ADOPTED as the spouse's only when it
  passes the checksum, no spouse id is on file yet, the client is not
  `not_married`, and the printed name does not contradict a spouse name
  from the form (`namesLooselyMatch`, which now lives in spouseIdentity.ts);
  else `id_matches_client` (and `subject`) fail with the reason (third
  person / not married / name mismatch). A name-only document passes
  `subject` against the client's or the spouse's name; nothing is ever
  inferred from a name. Sources: the kickoff reads spouse cells
  (`crmIdentity.ts` `crmSpouse` — a `SPOUSE_TITLE` cell with an id title is
  the id, without one the name — and `crmMaritalStatus`) from the
  questionnaire item first and the CRM card second (`spouseFromCards`),
  at enrollment and on every re-fired kickoff (`client.spouse_updated`
  audit when anything changed; `crmIdNumber` now skips spouse-titled
  cells); `verifyDocument.ts` re-reads the client before every verification
  (a batch is sequential and the first document may have just adopted the
  spouse), persists `verdict.adoptSpouse` whatever the other checks decided,
  records `client.spouse_inferred` (masked id) and adds `subject_matched` to
  the `verify_extraction` detail. The planner gets a fenced `CLIENT IDENTITY`
  block (`buildClientIdentitySection`: name, id on file yes/no, marital
  status, spouse name + whether an id is known and from where — never the
  digits) and `prompt.md`'s household rules (spouse assets belong to the
  declaration, spouse-owned instances carry the spouse's name, tie by the
  printed holder, never ask for an id number). The capital documents card
  shows one household line (masked id). Evals: `client.spouse` /
  `client.maritalStatus` per `extract_document` case.
- **Type-specific extraction fields** (2026-09-23; openspec
  `document-extraction`): a catalog type may declare `fields` — each an
  `ExtractionField` (`key`, `kind` text/number/date/year, `labelHe`,
  `promptHe`, `required`, optional `pattern` + `patternHintHe`) — plus
  `fieldsAnyOf` (at least one of these keys must be read) and
  `checks.periodCoversValuationDate` (`{from, to}` date fields whose period
  must contain 31.12 of the tax year). One declaration drives everything:
  `extractionSchemaFor` / `extractionJsonSchemaFor` (`verifyChecks.ts`)
  extend the base `ExtractionSchema` into ONE FLAT answer object (never a
  nested `fields` object), `typeFieldsPromptBlock` appends one instruction
  line per field to `{{type_context}}` in `buildExtractionCall`, `runChecks`
  reads each value through `typeFieldValue` (kind-normalised: `""`/`"/"` →
  null, 0 stays 0) and adds the `type_fields` check (a required null, an
  empty any-of group, or a malformed value — bad date form, year outside
  1950..taxYear+1, non-finite number, pattern mismatch — fails; observed lists
  every field as `label: value`) and, when declared, `period_covers_valuation_date`;
  `verifyDocument.ts` stores the whole answer as before and adds
  `fields: [{key, label, value}]` to the `verify_extraction` audit detail
  (`stepSummary.ts` renders it as `extracted_fields`). A type with no
  `fields` gets byte-identical schema, prompt and checks. First set:
  `bank_balance` (account, current-account balance — zero/negative allowed —
  deposits), `securities_portfolio` (account, NAV at 31.12, base currency),
  the savings family via the shared `SAVINGS_FIELDS` (fund name, account,
  closing balance, cumulative deposits; any-of the two amounts),
  `mortgage_balance` (loan number, principal at 31.12), `vehicle` (plate
  digits-only 7–8, maker, model, production year, purchase cost; all optional
  with any-of plate / cost because an item is either the licence or the
  receipt), `contents_insurance` (policy number, contents sum — chapter B, not
  the building sum — period from/to + the period check). The other nine
  types stay on the base schema. Evals: `expected.fields` per case
  (`evals/stages.ts`); the sample script `scripts/verifyExtractionSample.ts`
  builds the real request through `buildExtractionCall`.
- **Savings-family spec** (2026-08-31; the office's savings matrix): pensions,
  provident funds (incl. investment provident), study funds, managers'
  insurance and savings policies all share one requirement — a dedicated
  capital-declaration certificate from the managing body's site OR the last
  page of the abbreviated annual report (the two are equally acceptable);
  "חיסכון לכל ילד" accounts need no certificate at all (National Insurance
  deposits, so never an instance, and mentioning one alone doesn't make a row
  required). Encoded in the three savings catalog entries
  (`life_insurance_savings` moved off the old surrender-value ask),
  `prompt.md`'s special-case block and form intake. `analysisHintHe` on
  `pension_provident`/`study_fund` is seeded from three real fund samples:
  the dedicated certificate ("אישור מס להצהרת הון") certifies *cumulative
  deposits since first deposit* — legitimately 0 for an emptied account —
  while the annual-report page carries the year-end balance; both often
  arrive as one PDF, and a deposits-detail table alone is a lookalike trap.
Since 2026-08-23 the agent also reports its progress **back to the board**
(`src/agents/shared/mondayStatusSync.ts`): when a board source maps a
`statusColumnId` (settings UI: declaration-of-capital board mapping only, but
the backend is agent-generic), the agent writes fixed Hebrew
labels into that status column — "agent working" on conversation start
(kickoff webhook or first resume) and "documents collected" on goal
completion, reverting to "agent working" if the goal reopens. The write-back
address is remembered per client in `agent_fields.monday_board_id/monday_item_id`
(stamped at import — `fetchAllBoardRows` now returns item ids — and re-stamped
by every kickoff click; the import sweep backfills pre-existing clients).
Labels are written with `create_labels_if_missing`, so boards need no
pre-created labels. Requires the **boards:write** OAuth scope (added to
`MONDAY_OAUTH_SCOPES` + must be enabled in the monday Developer Center);
accountants connected before the scope change must reconnect monday. Sync is
best-effort: failures are logged, never block the conversation, and the
status-change events the writes fire back at the kickoff webhook are ignored
by its startable-state guards.
`annual_report_assistant` was retired 2026-07-31 — migration 041 disabled its
instances; the rows survive, hidden, because instance rows are never deleted
(migration 055 did the same for the types removed 2026-09-11).
Industry pattern followed: one app with an agent registry
(HubSpot Breeze / Salesforce Agentforce model) — never one app per agent.

## Concepts

- **Agent type** — behavior + UI defined in code. Backend half in
  `src/agents/<type>/`, frontend half in `web/src/agents/<type>.tsx`,
  registered in `src/agents/registry.ts` and `web/src/agents/registry.ts`.
- **Agent instance** — one row in `agent_instances` per (accountant, type).
  Every instance is admin-created
  (`agentInstances.enableInstance`); nothing is auto-provisioned at sign-in.
  Onboarding is admin-first (migration 043): activating (whitelisting) an
  accountant immediately creates their `users` row as an *invited* account
  (`google_sub` NULL, `users.createInvited`), so the admin can add agents and
  assign their email addresses and WhatsApp numbers before the accountant's
  first login; the first verified Google sign-in with that email claims the
  row (`users.claimInvitedByEmail`, Google-login callback only — unverified
  email claims like monday's must never claim an invited account). The
  accountant sees exactly the agents the admin configured. `enabled=false`
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
  on legacy CLI-era rows, for which no agent acts). Per-agent scalar fields
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
  Since migration 046 an accountant can connect **their own WABA**
  (`wa_business_accounts`, one per user) from the workspace Settings →
  Integrations tab (`web/src/components/WhatsAppBusinessSettings.tsx`;
  account-level routes `GET/POST/DELETE /api/wa-business`): via Meta's
  Embedded Signup popup (`META_APP_ID` + `META_ES_CONFIG_ID`) or by pasting a
  WABA id already shared with Twilio. When present, `provision.ts` registers
  that accountant's new senders under their WABA instead of the platform one —
  their display name, their messaging limits, no platform WABA slot used.
  Existing senders are not migrated; the WABA applies to provisioning only.

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

**Agent prompts are plain Markdown files**, not inline strings: each agent's
system-prompt template lives in `src/agents/<type>/prompt.md` next to its
`prompt.ts`. They use `{{placeholder}}` substitution and are loaded
at module init by `src/agents/shared/promptFile.ts` (`loadPrompt` /
`renderTemplate`). tsc does not copy them — `npm run build` runs
`scripts/copyPromptAssets.mjs` to place them in `dist/src`; keep new prompt
text in .md files, never in template literals.

**Blocked-day send guard**: the prompts tell the scheduling agents not to send
proactive messages on the Israeli weekend or on chag/erev chag, but that is
enforced in code, not trusted to the LLM: every planner passes the decision's
`send_at` through `rollBlockedSendAt` (`src/agents/shared/sendAtGuard.ts`) —
when the client has been silent for over 24h (i.e. the message is proactive,
not a reply in an active conversation), a send landing on Friday, Saturday, a
chag, or an erev chag rolls forward day by day to the first allowed day at
the same wall-clock time. Chag days come from `@hebcal/core` (Israel
calendar, yom tov only — chol hamoed/Chanukah/Purim stay open) via
`src/agents/shared/jewishHolidays.ts`, which also feeds the חג/ערב חג marks
in the `{{upcoming_dates}}` prompt calendar. New scheduling planners must
apply the same guard.

**One planner run per client turn** (openspec `inbound-turn`): WhatsApp
delivers the text and each file of one client turn as separate webhooks, so an
inbound webhook never runs the planner itself. The webhook half wraps its work
in `withInboundInFlight` (`src/orchestration/inboundTurn.ts` — a per-client
Redis counter plus a last-inbound stamp), cancels the outdated pending send at
once, stamps `drafting_since`, and the agent's `onInboundMessage` ends with
`requestReplan(clientId)` — a delayed BullMQ job `replan-<clientId>` that every
further webhook of the client pushes `INBOUND_QUIET_SECONDS` (15) into the
future. The job (`src/queue/replanWorker.ts`) plans only when the turn is
settled (`inboundTurnRules.ts`: no handler in flight, no recent
`analysis_status='pending'` file row, quiet window passed); otherwise it looks
again every 2 s and plans anyway after `INBOUND_MAX_WAIT_SECONDS` (300, logged
as a warning). An inbound that lands while the planner runs leaves a dirty
flag and the same job plans again after the quiet window. Not deferred: the
tax-fetch OTP fast path (returns before `requestReplan`) and the fixed reply
to a blocked message. Worker boot re-requests a lost job for clients with a
recent `drafting_since` and nothing scheduled (`recoverLostReplans`). New
inbound reactions must call `requestReplan`, never `setFutureEmail` directly.

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
  Types with `collectsTaxYear` (none today — the declaration year is per
  client) are year-gated
  the same way: the first enable must carry `taxYear` (the modal prefills the
  last concluded year), stored in `agent_instances.tax_year` (migration 042 —
  a column, not `settings`, because the accountant-facing settings PUT replaces
  that JSONB wholesale) and changeable later via
  `POST /api/admin/agent-tax-year`. `resolveTaxYear`
  (`src/agents/shared/taxYear.ts`) falls back to the last concluded year when
  unset (legacy instances from the auto-provisioning era). The year feeds the planner prompt
  (`{{tax_year}}` placeholder), the file analyzer (year-mismatched annual
  documents must not match), and new tax-fetch sessions (external sites hold
  multiple years).
  There is deliberately NO auto-derivation of instance sender addresses
  anywhere — `POST /api/admin/agent-emails` (also modal-confirmed in the UI)
  is the only other way an instance gets or changes its address;
  `GET/POST /api/admin/wa-senders`, `DELETE /api/admin/wa-senders/:agentInstanceId`
  (per-instance number assignment).
  Per-call LLM observability (049, `src/api/llmAdmin.ts`):
  `GET /api/admin/agents/:agentInstanceId/clients` (instance roster),
  `GET /api/admin/clients/:clientId/conversation` (the full thread, drafts and
  held rows included — the admin conversation viewer),
  `GET /api/admin/llm-calls` + `GET /api/admin/llm-calls/:id` (the per-call
  log browser, payloads only on the detail route).

## Frontend (`web/src/agents/`)

`AgentTypeUI`: `nameKey`/`descriptionKey` (i18n), `icon`, `clientTabs[]`
(id, labelKey, `render(ClientTabContext)`). The generic
`components/ClientView.tsx` owns load/SSE/poll/drafting logic and renders the
active type's tabs. Requests flow through `agentApi(agentId)` provided via
`WorkspaceApiContext` (`useWorkspaceApi()` in components; it throws outside a
provider — there is no unprefixed fallback).

Shell behavior (`Workspace.tsx`): boots on `GET /agents` and always
auto-enters an agent — the remembered one, else the first. The `AgentsHome`
card grid is
not accountant-reachable anymore (no landing page, no sidebar item) — it
survives only as the none-enabled message for agent-less accounts and as
the coming-soon pane's back target. A
`pinnedAgentType` prop can lock a surface to one type; no surface uses it
today — the monday custom object shows the same shell as the standalone app.

Workspace navigation lives in the URL hash on standalone surfaces
(`components/workspaceRoute.ts`), so a specific agent + client (conversation)
is deep-linkable: `#/agents/:instanceId/clients/:clientId`, prefixed
`#/as/:email/…` during impersonation (`/as/` is its own namespace because
`#/accountants/:email/agents/:type` is the admin drill-down). An admin
opening an `/as/` link without impersonating lands on that accountant's
admin page with the hash preserved, so "view as" continues straight to the
linked client. monday surfaces don't get hash routing (the iframe URL
belongs to monday) — `Workspace` falls back to in-memory navigation there
(`hashRouting` prop, set only by the standalone `App.tsx`).

### Admin "view as" session

The view-as session is a stateless signed cookie (`fm_impersonate`,
`src/api/auth.ts` + the pure `src/api/impersonationCookie.ts`) with a
**sliding idle timeout**: user activity re-issues it, and it ends after
`IMPERSONATION_IDLE_MINUTES` (default 1440 = 24h) with none. Three rules keep
that honest:

- **Background traffic does not count as activity.** Anything the SPA fetches
  on its own — interval refreshes, SSE-triggered reloads, a re-shown tab —
  must pass `{ background: true }` (`RequestOpts`, `web/src/api.ts`), which
  sends `X-FM-Background: 1`; SSE requests are recognized by their `Accept`
  header. **Every new timer-driven call must pass it**, or an untouched open
  tab keeps the session alive forever. Today: `ClientView`, `Overview`, the
  sidebar roster stream in `Workspace`, and the admin trace reload in
  `Timeline` (it follows every thread reload, so it is always background).
- **The workspace declares whose workspace it shows.** While viewing as an
  accountant, `request()` sends `X-FM-View-As: <userId>` and header-less URLs
  (SSE, downloads) carry `?viewAs=`. `requireAuth` answers `409 { code:
  'impersonation_ended' }` when its own view-as session disagrees (idled out,
  exited or switched in another tab) instead of serving the request as the
  admin — which used to surface as a misleading "Agent not found.".
  `/admin/*` is exempt so a new session can be started.
- **One reaction on the client.** `request()` turns that 409 into
  `ImpersonationEndedError` (empty message, so the usual `err instanceof
  ApiError ? err.message : …` banners stay silent) and signals `App.tsx`, which
  shows `ImpersonationEndedModal`: start a new session (reload keeps the
  `/as/…` hash → same agent + client) or go back to the admin panel.

Idle expiry is audited as `admin.impersonation_expired` (start/stop come from
the admin route map); extensions are not audited.

## Adding an agent type (checklist)

1. `src/agents/<type>/index.ts` — the `AgentTypeDefinition` (see
   `declarationOfCapital/` for the full shape).
2. Register in `src/agents/registry.ts` + add a Hebrew default name in
   `DEFAULT_INSTANCE_NAMES` (`src/db/queries/agentInstances.ts`).
3. `web/src/agents/<type>.tsx` — `AgentTypeUI` with tabs; register in
   `web/src/agents/registry.ts`; add `agent<Type>Name/Desc` strings to all
   three locales in `web/src/i18n.tsx`.
4. Per-client scalar fields → `agent_fields` JSONB; relational data → new
   tables keyed by `client_id` (own migration).
5. No migration needed for the type itself (`agent_type` is TEXT, validated in
   code). Enable it per accountant from the admin panel.

## Collection lifecycle (completion & due date)

- **Goal complete** (every row settled and the attestation confirmed): the
  agent stops (guards in `setFutureEmail`/`sendEmailWorker`) and emails the
  accountant — `notifyAccountant.ts`, sent from a no-reply platform address
  to their login address, deliberately *not* stored in `emails` (that table is
  the client conversation). Both completion paths notify: the LLM plan
  (`plan.ts`) and the manual documents toggle (`router.ts`). No closing
  message is sent to the client.
- **Due date passed** (`agent_fields.due_date`, "YYYY-MM-DD"): the
  `overdue_scan` BullMQ queue (daily job scheduler at 00:10 local +
  a catch-up scan on worker boot, `overdueScan.ts`) pauses the
  client and emails the accountant the missing documents — the client is
  handed off. Two `agent_fields` markers: `overdue_notified_at` (idempotency —
  cleared only by a due-date edit) and `overdue_stopped_at` (the "handed off"
  UI state — cleared on resume or due-date edit). Resuming, or editing the due
  date (`PUT /clients/:id/due-date`, the agent router), puts the agent
  back to work; manually paused clients are never overdue-stopped.

## Tax-authority 106 fetch (browser automation)

The agent can fetch a client's Form 106 (טופס 106) straight from the
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
  consent→delivery; the LLM sees every mechanically-possible action in the
  current state (`allowedTaxFetchActions` in `decisionSchema.ts`, shown in the
  prompt's `buildTaxFetchSection` and re-validated in `normalizeDecision` via
  the `tax_fetch_action` decision field). Offering is NOT a state or an action
  (the `offered` status was retired in migration 045): the model offers in
  message text and reads the thread to know it already did; the session first
  exists when the client agrees — `client_agreed` creates it directly at
  `wa_intro_sent` — or when a login starts. The hard guards: no action at all
  after `delivered` (never re-fetch), `cancel` only while a live browser
  session is mid-flight, consent/login require `available`, and `start_login`
  requires `clientOnWhatsapp` (above). Everything conversational is the
  model's judgment; only side-effecting steps are code-gated.
  `taxFetch/flow.ts` loads state + acts.
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
- **Failure diagnostics**: a failed runner step (login/OTP/download) answers
  its 502 with a full-page screenshot of the moment of failure plus an optional
  machine-readable `code` — the only evidence that survives an ACI container
  teardown. The worker stores the screenshot under `debug/taxfetch/<day>/` in
  the documents blob container (`taxFetch/failureShots.ts`; blob key logged and
  recorded on the `tax_fetch.failed` audit event) and the daily `debug_cleanup`
  job (03:20 local) deletes shots older than `TAX_FETCH_DEBUG_RETENTION_DAYS`
  (default 14). `code: 'no_documents'` marks the login-worked-but-the-site-
  listed-nothing outcome (e.g. Harel's filter query answered with an empty
  table): the session still ends `failed`, but with a marker error prefix that
  becomes the `failed_no_documents` prompt state — the client hears "the
  document isn't there" (`messages.noDocumentsOnSite`) and the planner is told
  to check with the client rather than blindly retry.
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
  Only the tax authority needs that row (its login also takes the user code).
  Altshuler and Harel log in with a national id + the client's WhatsApp
  number, and take the id from `taxFetch/clientId.ts` `clientIdNumber` in
  one shared order — the provider's own credentials row → the tax-authority
  row → `agent_fields.id_number` stored by the kickoff from the CRM card —
  used both by the availability check (`flow.ts`) and the runner's login, so
  an offer the agent makes can always be carried out; verification's
  `clientIdOnFile` uses the same helper before its lazy CRM fetch (openspec
  `document-fetch`).
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
  SECURITY NOTE annotation in the transcript. The doctrine names the
  platform-written sections (`PLATFORM_SECTIONS` in `prompt.ts`: WhatsApp
  channel, document fetch, deadline, intake status) as trusted — their
  guidance is binding; client-sourced content never is. The planner gives
  **no** injection verdict (its schema has no `suspected_injection`; removed
  2026-09-18 after it flagged the platform's own DOCUMENT FETCH block):
  detection belongs only to the dedicated screens below, which run before the
  planner, and every planner state change stays behind the code gates.
- **Analyzer isolation + quarantine** (`analyzeFile`/`analyzeReceipt`): the
  file analyzers see only the file bytes (never the conversation), are told
  the file is untrusted, report `injection_suspected`, and their
  `matched_document_id` is validated against the real list at write time.
  Quarantined files (`isQuarantined` in `src/agents/shared/fileEvidence.ts`:
  suspected or illegible) render as an explicit warning in transcripts, are
  never linked to documents, and never count as evidence; the workspace files
  card shows a "תוכן חשוד" badge.
- **Authority reduction** — LLM verdicts alone can't flip consequential state:
  - Documents: `collected` requires file evidence — the
    analyzer's own match (tier A, `fileMatchesDocument`) or a planner pairing
    with a verified legible file (tier B, `isVerifiedLegibleFile`). A no-file
    claim ("delivered by fax / in person") becomes status **`claimed`**
    (migration 030) + a confirm-request email to the accountant; only the
    accountant's click (documents-tab checkbox → `collected`) completes it.
    Goal completion counts only `collected`.
  - Tax fetch: `start_login` requires a live WhatsApp conversation — an email
    alone can never arm it (see the 106-fetch section above).

Tests for the pure helpers live in `tests/` (`npm test`, node:test via tsx).

## Current state & deferred work

- **Client-import sources**: the accountant links monday boards (per-instance
  in `agent_instances.settings`, `declarationOfCapital/settings.ts`; Google
  Sheets are supported by the shared machinery but hidden for this
  phone-keyed, kickoff-only type) and rows are enrolled via the kickoff
  webhook — the settings panel's per-source "import now"
  (`POST /client-sources/scan`, optional `source` body narrows the sweep to
  one board/sheet) and the daily sweep (queue `client_import_scan`, 00:50
  local + boot catch-up) exist but skip catalog-seeded types. Shared
  machinery lives in `src/agents/shared/`: `clientSources.ts` (source schemas
  + whole-source sweep + candidate collection), `clientImportScan.ts`
  (enroll-all scan; no LLM screening), `clientSourcesRoutes.ts` (the
  `/client-sources/*` routes the agent mounts), `mondayData.ts` /
  `googleData.ts` (the live board/sheet reads, also used by the kickoff
  webhook and the board status sync). Web: `ClientSourcesSettings.tsx` is the
  shared panel (connections, board/sheet pickers, import-now).
- Deferred (unblocked by design, not built):
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
  bucketed in `ACCOUNTANT_TIMEZONE`; both carry `cached_tokens` since 049
  (prompt-cache reads, a subset of input, billed at the discounted
  `cache_read_input_token_cost` rate — `computeCost` in `src/gemini/pricing.ts`
  is the single arithmetic path). `GET /api/admin/llm-usage/daily?days=N`
  returns the priced cube; the admin `#/usage` page (AdminUsage.tsx) charts it
  with client-side grouping (accountants / agent types) and filters. Every new
  Gemini call site must pass its agent instance id to `llmUsage.add`.
- **Per-call LLM log** (migration 049, admin-only; the A/B experiment arms
  that shipped alongside it were removed by migration 052).
  `llm_calls` is the per-call record: the exact
  request (binary parts reduced to `{mimeType, sizeBytes}` placeholders —
  never bytes), the response text, tokens by kind incl. cached, and the four
  per-token USD prices **at call time** plus the computed cost. It is written
  centrally from `generateWithRetry` for every call site that passes an
  `LlmCallLogContext` (fire-and-forget; logging never fails the call). **Every
  new LLM call site should pass a `LlmCallLogContext` to `generateWithRetry`**
  alongside the existing `llmUsage.add` obligation (today wired: the
  the agent's six sites — `generate_message`, `questionnaire_schema_mapping`, `injection_detection_llm`, `file_splitting`, `file_classification`, `extract_document`).
  Like `audit_events`, `llm_calls` has no FKs — call history outlives clients.
- **Audit trail + anomaly detection** (migrations 031-032): `audit_events` is
  the per-action forensic record — one row per outbound email/WhatsApp,
  tax-authority login/OTP/delivery, LLM-driven status change
  (collected/claimed/goal-complete statuses), injection-suppressed
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

## Code gates and the three injection layers (2026-09-11)

Ported from the standalone sibling DoC agent (`projects/salesforce-agent`):

- **Every LLM result is followed by a named code gate**, audited as one row
  per run with `detail.result: true|false`, the reason, and — since
  2026-09-12 (openspec `code-gates`) — `detail.checks`: the ordered list of
  the checks that actually ran, each `{ key, passed, note, observed, expected }`
  (`note` = the failure reason, `null` on a pass; `observed` = the value the
  check looked at, also on a pass; `expected` = the reference it was compared
  with, when there is one; a check that did not apply is absent, not
  "passed"). National ids never appear in full — `maskId` keeps the last three
  digits. The type, the `check()` builder and `maskId` live in
  `shared/gateChecks.ts`; the pure rules modules return the list and the call
  sites only copy it into the audit row. Gates and their checks:
  `injection_detection_regex` (one check per named pattern, the match as the
  note), `validate_injection_scan` (`clean_without_evidence` |
  `hit_has_evidence` + `evidence_verbatim` when the text was readable),
  `validate_form_resolutions` (one check per proposed catalog type key, drop
  reason as note), `validate_file_split` (`document_count_within_cap`, then
  `ranges_inside_file`, `ranges_ordered_no_overlap`, `all_pages_covered` — a
  failed check ends the list), `validate_classification` (`matched_id_known`,
  `matched_type_agrees`, then `not_injection_suspected` / `legible` — the
  quarantine checks are reported but never change `result`),
  `validate_message` (one row per decide attempt: `json_schema`, then
  `business_rules` via `gateDecision` in `decisionSchema.ts`; the second is
  absent when parsing failed), `verify_extraction` (the per-document table
  from `verifyChecks.ts`: `legible`, `expected_type`, `subject`,
  `id_checksum`, `id_matches_client` (passes when the printed id is the
  client's OR the one spouse's on file; its `expected` names the person
  matched and the source of that id: `client ••••••448 (monday CRM)`,
  `spouse ••••••821 (document)` — on a failure both persons on file), then
  `spouse_adopted` (informational, only when the printed id was just adopted
  as the spouse's — see "Spouse identity" below), `client_id_on_file` (when
  the document prints an id but none is on file — reported, never enforced),
  `as_of_date`, `not_expired`, `amounts`, then `type_fields` and
  `period_covers_valuation_date` for a type that declares extraction fields
  (see "Type-specific extraction fields" above) — each with the value read
  from the document as `observed` and the reference as `expected`; the amounts
  check names the exact failing amount and condition in its reason; the row's
  detail also carries `fields` (key, Hebrew label, value) so the step modal
  lists the typed values by name). In the trace viewers every
  step row is a button that opens `StepDetailModal`: a "what the step did"
  section built by `stepSummary.ts` from the row's detail (document names,
  evidence quotes, channel, scheduled time; labels in `i18n.stepFieldLabels`,
  unknown keys listed generically so nothing is hidden), then, for a gate
  row, its `checks` list (✓ / ✗ per check, "נבדק:" / "צפוי:" value lines,
  the note under a failure; labels in `i18n.gateCheckLabels`), then the raw
  JSON collapsed.
  Every step has its own link, `<site>/#/steps/<audit row id>`
  (`stepLink.ts`). `App.tsx` handles that hash before the admin / workspace
  split (the workspace router would rewrite it) and, for an admin only,
  mounts `StepLinkPage`, which loads the row from
  `GET /api/admin/audit-events/:id` (requireAdmin; same step shape as the
  conversation endpoint, no `discarded`) and shows the same modal, or an
  in-app "step not found" card. The modal has no close button (it closes on
  the backdrop and Escape); at its top, beside the title, sit two copy
  buttons: "copy link",
  and "copy details" (the link, then the whole step as JSON — the way to hand
  a step from sandbox / production to Claude, whose shell reads only the
  local database). Locally, `npm run step -- "<link-or-id>"`
  (`scripts/showStep.ts`) prints the row as JSON.
  A step about a received file (audit target `document_file`:
  `validate_classification`, `validate_file_split`,
  `injection.cycle_suppressed`, `email.document_sent`) opens as a two-pane
  modal: the details on one side, the document itself on the other (PDF in
  the browser's viewer, image as a picture, "download" and "open full size"
  above it; stacked under 900px). The file is read by the step id alone —
  `GET /api/admin/audit-events/:id/file` (name and type), `/file/view`
  (inline) and `/file/download` (requireAdmin; `stepFile.ts` resolves step →
  file, 404 for a non-file step or a deleted file) — so it also works from a
  step link with no impersonation. The modal asks for it only on open. The
  streaming and the inline-type allowlist live in `src/api/fileStream.ts` /
  `fileDisposition.ts`, shared with the workspace file routes — never copy
  them: an HTML or SVG file served inline would run script on the API origin.
  A gate never flips a security verdict: it drops or rejects, it does not
  make a "suspected" answer "clean". Pure rules modules (no llm/db/audit
  imports, tests run without an API key): `shared/injectionRegex.ts`,
  `shared/injectionScanRules.ts`, `splitFileRules.ts`, `analyzeFileRules.ts`,
  `formIntakeRules.ts`, `verifyChecks.ts`,
  `decisionSchema.ts`.
- **Request builders**: each stage exports the exact `generate()` request it
  sends (`buildFormIntakeCall`, `buildInjectionScreenCall` /
  `buildFileScreenCall`, `buildFileSplitCall`, `buildAnalysisCall`, `buildExtractionCall`,
  `buildDecisionCall`) and the runtime does `runLlmCall(build…(), { log })`
  (`gemini/llmCall.ts`). The evals harness (`evals/`) calls the same builders
  with a per-call `model` override and a file log sink, so it tests what the
  app sends and leaves no trace in `llm_calls`.
- **Three injection layers on every untrusted input** — form answers
  (`formIntake.ts`), every inbound message (`screenInbound.ts`,
  before planning) and every attached file (`analyzeInboundFile.ts`,
  before classification): (1) `injection_detection_regex` — eleven named
  patterns, first hit wins, no model; for a PDF also over the text layer
  `shared/fileText.ts` can read (dependency-free; Hebrew CID fonts come out as
  glyph ids, so '' / short text means "not checkable", never "clean");
  (2) `injection_detection_llm` — the dedicated LLM scan, a text variant and a
  multimodal file variant (margins, footers, tiny/low-contrast text), fails
  closed; (3) `validate_injection_scan` — a hit must quote the reviewed text
  verbatim, a clean verdict carries no evidence, a rejected proof never flips
  a hit. A hit on a message sets `emails.blocked` (migration 054): the
  transcript shows `[message withheld …]`, the client gets a fixed WhatsApp
  reply with no model consulted (`BLOCKED_REPLY_HE`), and the re-plan still
  runs so the follow-up chain survives. A hit on a file sets
  `document_files.analysis_status = 'blocked'` + `blocked`: quarantined before
  classification (`isQuarantined`), never evidence, never linked. Both audit
  one `injection.cycle_suppressed` row (the sibling's name; targets the email
  / document_file, `detail.source` = `inbound_message_screen` /
  `inbound_file_screen`). Stage purposes carry the sibling's names too since
  migration 056: `injection_detection_llm`, `questionnaire_schema_mapping`,
  `generate_message`, `file_classification`, `extract_document`.
- **Multi-document PDFs are split before classification** (2026-09-19,
  migration 058, openspec `file-splitting`). Inbound-file order in
  `analyzeInboundFile.ts`: analyzable check → the three injection layers on
  the whole file → for a PDF whose page count (read by code,
  `pdfPages.ts` — the only module importing `pdf-lib`) is 2 or more, the
  `file_splitting` stage (`splitFile.ts`: "which pages form each document";
  the answer is page numbers plus an audit-only `kind`) → the
  `validate_file_split` gate (`splitFileRules.ts`: 1..20 documents, every
  range inside the file, ascending with no shared page, every page in exactly
  one range; audited on the parent file) → when 2+ documents are accepted,
  `cutPdf` makes one child PDF per range, each stored as an ordinary
  `document_files` row (`parent_file_id`, `page_from`, `page_to`, the parent's
  `email_id`, attachment id `<parent>#p<from>-<to>` so a re-run inserts
  nothing) → the parent gets `analysis_status = 'split'` → **each child goes
  through the unchanged classifier** (one file, one verdict) and then links and
  verifies like any file. Children skip the injection layers (the whole parent
  passed them); the classifier's and the extractor's own flags still apply per
  child. Anything else — an image, a one-page PDF, a PDF the library cannot
  open, a rejected answer, a single accepted document, any error — cuts nothing
  and classifies the whole file as before. The parent is kept as the original
  the client sent: never classified, never evidence (`isSplitParent`), never
  paired by the planner (`applicableFilePairs` drops it; the transcript tells
  the planner to judge the children), shown in the documents tab's unmatched
  group with a "split into N documents" badge. The conversation shows the
  parent and every child as attachment chips under the message the file came
  on; a child chip reads "<original's name> · pages X–Y". Known limit: ranges
  are consecutive pages, so a scan with pages in mixed order will not split
  correctly.
- **A matched child is named after its list document** (2026-09-19, openspec
  `file-splitting`, no migration). When the classifier matches a child and
  `validate_classification` keeps the match (and the child is not
  quarantined), `classifyAndStore` writes the matched row's name to
  `document_files.label` (`splitChildNames.ts` `childDisplayName`; our own
  list text only, never the model's `kind` or the file's text). Quarantine or
  a failed analysis → `label = NULL` and the page-range name stays. The label
  follows a planner link to another row (`plan.ts`, after `linkToDocument`).
  Since 2026-09-22 (change `name-matched-files-by-company`) a matched row of
  an institution-bound type that names no company gets the file's company
  appended — `companySuffixedName` in `splitChildNames.ts`: "<row name> —
  <institutions-table nameHe>" when `identifyInstitution(issuer_name)` finds
  exactly one company, the row's name alone otherwise. The same function
  names the rows the per-company split makes (below), so a child's label and
  the row it ends under carry the same string.
- **An unmatched child is named after its type and company** (2026-09-20,
  openspec `file-splitting`, no migration). With no kept match,
  `splitChildNames.ts` `childLabel` builds the label from two of our own word
  lists: the catalog's `shortNameHe` of the file's `document_type` (a few
  words, never a date — no code has checked the date of an unmatched file)
  and, when `identifyInstitution(issuer_name)` finds exactly one company, that
  entry's `nameHe` from the institutions table (always one of its own
  `aliases`; English `name` for the foreign banks) — "קרן השתלמות — הראל".
  Unknown company or two companies → the type words alone; type `other` →
  no label. The model's `issuer_name` is only looked up, never shown. A label
  is display only: it links nothing and the planner's view is unchanged. Two
  children of the same type and company get the same label; the page range
  next to it tells them apart. Children analysed before this change:
  `npm run db:backfill-child-labels` (idempotent).
- **Child names, common rules.** The stored `filename`, the blob key and what the planner
  sees do not change. Shown as: documents tab = label + "pages X–Y of
  <original>"; conversation chip = "<label> · <original's name> · pages X–Y";
  viewer title = "<label> · <stored name>"; download =
  `<label> (<original base> pX-Y).pdf` (`childDownloadName`, illegal file-name
  characters replaced). Files that were never split get no label from this.
- **Classification cross-check**: capital-declaration files answer with a
  closed `document_type` (catalog keys + `other`, `CAPITAL_DOCUMENT_TYPE_VALUES`);
  `validateClassification` drops a matched id the model was not shown or
  whose row type disagrees with `document_type`.
- **Files that belong to no agreed item** (2026-09-19, openspec
  `unlisted-files`, no migration). Owner rule: the document list is an
  agreement with the client; a received file never changes it. Four pieces:
  1. *Candidates* — `classifyAndStore` offers the classifier only
     `classifierCandidates(rows)` (`analyzeFileRules.ts`): rows that are not
     `unresolved` / `not_required` / `retired`. A file of a type never discussed
     therefore ends as "matches no required document".
  2. *Company check in code* — for the institution-bound types
     (`institutionBound` in `catalog.ts`: bank_balance, securities_portfolio,
     pension_provident, study_fund, life_insurance_savings, mortgage_balance)
     the classifier also answers `issuer_name`; `institutions.ts`
     (`identifyInstitution`, whole-word aliases, Hebrew prefix letters, longer
     alias wins, two companies in one text = ambiguous) maps the issuer and the
     row's name to a key of `institutionsTable.ts`. One rule,
     `tieAllowedByCompany`, serves the gate and the planner: same company →
     kept; two identified, different companies → never; the row names no
     company the table knows (questionnaire rows are often named after a
     person, "קרן השתלמות ניב") → kept on the type agreement alone (change
     `accept-match-without-item-company`, 2026-09-22); the file's company not
     identified → only on the client's quoted words, which the gate never has.
     `validate_classification` reports check `issuer_matches_item` (a kept
     no-company row shows as passed with expected "not identified"); a drop
     reason is stored as `analysis.match_dropped` and shown to the planner.
     A person-named row that collects files from several companies is split
     by company at tie time (item 5 below), so the list ends with one row per
     company. The table is a snapshot of the public registers
     (`INSTITUTIONS_AS_OF`, sources and every entry's origin in
     `docs/institutions-register.md`) — refresh it by editing the table, never
     from memory. One key per brand, not per legal entity.
  3. *Items only on the client's quoted words* — `decisionSchema.ts`: every
     `required` resolution and every `added_instances` entry needs `evidence`
     (stored inbound message id + verbatim quote); a file-only message has no
     text to quote, the questionnaire / file names / analysis text are never
     evidence. The quote is stored in `resolution_evidence` of every created row
     and shown in the `apply_resolutions` / `apply_additions` step. The prompt
     tells the planner to mention a relevant unmatched file and ask, and not to
     ask again after a "no".
  4. *Same-cycle attach* — each new instance carries `file_ids`; after the rows
     are created `assignFilesToNewRows` (`fileTies.ts`) lets a row take a named
     file only when it is the client's, not a split parent, verified legible,
     unattached, of the row's type, not taken twice, the row is `pending`, and
     the company check allows it. Accepted pairs join the cycle's pairs and
     collected ids, so the normal path links, verifies and runs one follow-up
     cycle (the answer was a `collect`, so it carried no message). This lifts the old limit "a row created in a
     cycle cannot be collected in that cycle" for this case only.
  5. *Per-company split* (2026-09-22, change `name-matched-files-by-company`,
     no migration). The one code-made exception to rule 3: when the cycle's
     allowed pairs tie files of recognised companies to a row of an
     institution-bound type that names no company, `planCompanySplit`
     (`companySplit.ts`, pure) renames the row after the first company (by
     pair order) and plans one sibling per further company, each "<row name>
     — <nameHe>"; files of one company share a row, a file of an unrecognised
     company stays on the head. `clientDocuments.splitByCompany` applies it in
     one transaction (head `name` only, siblings copy `type_key` and
     `description`, born `pending` with `resolution_evidence = {source:'file',
     file_id, issuer}`); a head no longer pending/claimed/collected is skipped
     whole and its files fall back to it. `plan.ts` runs this before the
     collect decision (never in the after-verification follow-up), redirects
     the pairs, adds the created ids to `pendingIds` and — when the model
     proposed the head collected — to the proposed set, so each row is
     collected on its own tied file and verified against it (an item the split
     touched takes this cycle's pair as its verification file, not a strong
     match from the pre-link `files` snapshot). Created rows are audited as
     `document.instances_added` with `reason: 'company_split'`; the
     `apply_collections` detail carries `split.renamed` / `split.created`,
     shown in the step modal as "old → new" and "row ← file". Consequence,
     accepted by the owner: after the split every row names a company, so a
     later file of a fourth company matches none of them and the agent asks
     the client as for any unmatched file. Companion rule in
     `fileEvidence.ts`: `fileMatchesDocument` also requires the file to be
     unfiled or filed under that same row, so a sibling's file (whose stored
     `matched_document_id` still names the head) is no longer evidence for the
     head in later cycles.
  6. *Per-employer split* (2026-09-23, change `name-items-by-employer`, no
     migration). Second stage of the same `planCompanySplit`, for
     employer-bound rows only, run whether or not stage 1 renamed the row (a
     row that already names its company, such as "… — ניב — מיטב", is divided
     too): within each resulting row (the head and every stage-1 sibling) the
     files are grouped by `cleanEmployer(analysis.employer_name)`; the first
     employer whose text the row's name does not already contain renames the
     row (or extends the sibling's planned name) to "<name> — <employer>", each
     further employer gets one more sibling built on `employerBaseName` (the
     name without a trailing employer part that follows the company part, so
     a row "… — מיטב — פרייסמנס" spawns "… — מיטב — טבע", not a double
     suffix); a file with no printed employer stays where it is, so does a
     file whose employer the row already names. Created rows carry
     `employer` (`CompanySplitCreated`), their evidence
     `{source:'file', file_id, issuer, employer}` and the audit `reason:
     'employer_split'`; the `apply_collections` detail's `split.created[]`
     carries `employer` and the step modal shows "row ← file (employer)".
     `plan.ts` writes through `splitByCompany` every touched row, also one
     with no rename (its unchanged name is the live-status check). Owner
     decision (2026-09-23): the employer is a classifier field, not a typed
     extraction field — extraction runs after collection, too late for the
     label and the split.
  The same company check guards planner pairs (`filterPairsByCompany`): two
  identified, different companies are always refused; a file of an
  unidentified company needs `matched_files[].evidence` (the client's quoted
  words); a row that names no company takes the file when the analysed
  `document_type` equals the row's type (else `type_differs`). A refused tie
  never turns the row `claimed`; refusals are listed in `apply_collections`
  (`refused`). Known limit: `gemini-2.5-flash` sometimes files a confirmed
  extra fund under the wrong open type (eval `dec_13`); code then refuses the
  attach (`type_differs`).
- **State what the file shows, ask only to confirm** (2026-09-20, openspec
  `unlisted-files`, change `confirm-file-findings`, no migration). Owner rule:
  the agent never asks the client for a fact a file already shows ("how many
  policies, in whose name?"); it says what it read and asks for a yes. For the
  institution-bound types the classifier also answers `holdings` — one entry
  per account / fund / policy the file shows: `product`, `holder_name` (null =
  no readable name, never guessed from the file name or the list),
  `account_number` — plus `holdings_partial`. `validate_classification` keeps
  the list only for an institution-bound `document_type` and cuts it to
  `MAX_HOLDINGS`; it adds no check and never touches the verdict. The list is
  descriptive: it ties nothing, creates nothing, and is not evidence.
  `formatHoldings` (`prompt.ts`) prints it on the file's analysis line with our
  own count, sanitized texts, "hidden in the file" for a null holder and only
  the last 4 characters of the number (the full number stays in
  `document_files.analysis`). The prompt rule ("קובץ שאינו שייך לרשימה"):
  state company / kind / count / holders and ask to confirm; an open question
  only for a fact the line does not show, saying that it is missing (a hidden
  holder must be said and asked); many files of one turn = one grouped
  statement and one confirmation request; a short "yes, all correct" is the
  client's own words, so all confirmed items are created in that cycle, each
  with its waiting file in `file_ids`. Analyses stored before the change have
  no list and are shown as before. Known limit: one file that shows several
  policies can still be attached to one item only. Evals: `cls_12`–`cls_14`,
  `dec_15`–`dec_18`.
- **Employer on a fund report** (2026-09-23, openspec `unlisted-files` +
  `file-splitting`, change `name-items-by-employer`, no migration). A study
  fund or pension fund is opened per employer, so one client often holds
  several funds at one company, each with its own report, while the tax
  certificate page lists every account — `holdings` cannot tell the reports
  apart, the employer can. For the two *employer-bound* catalog types
  (`employerBound: true` on `study_fund` and `pension_provident`,
  `isEmployerBound`) the classifier also answers `employer_name` — the
  "שם המעסיק" line as printed, null when none is printed or the file shows
  funds of several employers; `validate_classification` nulls it for every
  other type and adds no check. It is the one word a name may carry from the
  file: every use goes through `cleanEmployer` (`splitChildNames.ts` —
  unprintables out, spaces collapsed, our " — " separator replaced, ≤
  `MAX_EMPLOYER` = 60 characters or dropped, at least one letter), and
  `employerSuffixedName` appends it after the company: a matched child of an
  employer-bound row becomes "<row name> — <company> — <employer>", an
  unmatched one "קרן השתלמות — מיטב — פרייסמנס בע"מ" (each part optional).
  `formatEmployer` (`prompt.ts`) prints `employer: <cleaned>` on the file's
  analysis line for those types only, and the planner prompt says the
  platform divides such a row per employer in code (no question, no
  instances). Older analyses have no employer and are shown as before.
- **Reply after verification** (openspec `verification-reply`;
  `decisionSchema.ts`, `verifyBatchRules.ts`, `verifyDocument.ts` →
  `verifyBatch`): the planner's `decision` has three values. `collect` is
  mandatory whenever the answer ties a file to a row (`collected_document_ids`,
  `matched_files`, or an instance's `file_ids` — `answerTiesFiles`) or claims a
  document, and a `collect` answer carries **no message**: every message
  field, `send_at`, `tax_fetch_action` and `attestation: request` must be
  null (the gate rejects a `collect` with a message and a `follow_up` with
  ties, then asks for one correction; change `no-draft-when-collecting`,
  2026-09-23 — before it the collecting cycle wrote a full message that was
  thrown away). `plan.ts` branches on the value: it records step
  `withhold_reply` (label "Reply deferred", kept for older trails), applies the
  message-independent state changes, verifies every just-collected document
  inline (one after the other, under the caller's client lock and inside the
  same `setFutureEmail` drafting attempt, so a restart cannot lose the reply;
  a throwing verification is logged and skipped), records ONE
  `planner.rerun_after_verification` step listing each document with its
  outcome (approved / reopened / stalled / skipped / error), and calls
  `planFollowUp` once more with the `afterVerification` hint (`PlanHints` on
  `AgentContext`) — also when the batch is empty because the code refused
  every tie or every collected document was claimed without a file. That
  follow-up cycle writes the single reply with every verdict in view; its
  request schema has no `collect` value (`DecisionContext.afterVerification`,
  `decisionSchemaForContext`) and its ties are ignored, so it cannot verify
  again — no loop. Message-bound actions (attestation request, fetch action —
  `client_agreed` assumes this cycle's message is the intro) are absent from
  the collecting answer; the follow-up decides them. `verifyCollectedDocument`
  only returns its outcome and never re-plans. Batches started outside a
  planning cycle (fetch delivery, `taxFetch/deliver.ts`) use
  `verifyBatchAndReplan`: verify the batch, then one locked re-plan with the
  hint. The follow-up cycle is told which verdicts just landed:
  `PlanHints.verificationResults` becomes the **VERIFICATION RESULTS** prompt
  block (`buildVerificationResultsSection`, a trusted `PLATFORM_SECTIONS`
  entry, placed before the thread; absent in every other cycle) — one line per
  document with the file of this turn and `APPROVED` / `REJECTED: <reasons>` /
  `HANDED TO THE OFFICE` / `NOT VERIFIED YET`; with the hint set and an empty
  batch the block instead says that no file of this turn was verified and
  that the answer may not collect. Without it the model only saw
  the row note "קובץ קודם נפסל באימות" and described just-rejected files as
  "received, being checked" (live test 2026-09-19). `prompt.md` keys its
  report-the-verdict rule on this block, not on "the last message is yours".
- **Spend cap** (`gemini/budget.ts`, admin Settings → "תקרת הוצאה למודלים",
  `GET/PUT /api/admin/llm-budget`): two daily USD ceilings in `app_settings`
  (`llm_budget_daily_usd` platform-wide, `llm_budget_daily_instance_usd` per
  agent instance) judged against today's priced `llm_calls` rows (cached per
  process for a minute, incremented in-process per call). Reached →
  `generateWithRetry` refuses the call before sending it, audits
  `llm.budget_exceeded` (critical → admin alert) and throws
  `LlmBudgetExceededError`. 0 = unlimited. Harness calls (file sink) are
  exempt and carry their own `EVALS_MAX_SPEND_USD`.
- **System/user split on every stage**: builders put instructions + trusted
  context in `systemInstruction` and only the client's fenced/sanitized data
  (or the file bytes + filename) in the user turn (`formIntakeCall.ts`,
  `injectionScreen.ts`, `analyzeFile.ts`, `extractionCall.ts`).
- **Evals harness** (`evals/`, `npm run evals`, skills `run-evals` /
  `add-eval-case` / `add-llm-stage`): 55 code-judged cases over the five
  stages, a model matrix, `latest.json` + a self-contained `report.html`,
  synthetic PDFs (`evals/make-files.ts`), its own spend cap
  `EVALS_MAX_SPEND_USD`. Sends the app's exact requests via the builders
  with a per-call model override and the file log sink.
- **Admin observability**: `#/llm-stages` (`GET /api/admin/llm-stages`,
  `gemini/llmStages.ts` — every stage from the call sites' own constants, a
  unit test fails on an undocumented purpose) and the admin conversation
  viewer now interleaves messages, LLM calls and code steps (gates, `apply_*`,
  `send_reply`) into one timeline (`GET /api/admin/clients/:id/conversation`
  returns `calls` + `steps`). The same trace is available inside the
  accountant workspace's conversation tab, but only to an admin who is
  impersonating: `ViewerProvider` (`web/src/agents/ApiContext.tsx`) carries
  `isAdmin`, `Timeline` shows a "קריאות LLM ושלבי קוד" toggle (persisted in
  localStorage) and fetches the admin endpoint, which `requireAdmin` gates on
  the REAL user — an accountant's session never gets the data, and the monday
  embed has no provider so the toggle never renders there.
- **Apply phase**: `plan.ts` records one `apply_resolutions` /
  `apply_additions` / `apply_retirements` / `apply_collections` /
  `apply_attestation` / `send_reply` row per decision field that changed
  state (never for a no-op). The detail names every document the step
  touched next to its id (`applyStepDetails.ts`: `name`, `anchorName`,
  `collectedNames`, pair `fileName` / `documentName`), so the row stays
  readable after the document is deleted and the modal never shows bare
  ids; rows written before 2026-09-13 carry ids only.
