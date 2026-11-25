## Context

- Fetch providers are code: `src/agents/declarationOfCapital/documentFetch/providers.ts` registers one `FetchProviderSpec` per site (`israel_tax_authority`, `altshuler_shaham`, `harel`), each with its `documents[]` (keys `form106`, `pension_annual`, `study_fund_annual`). `listProviderSpecs()` is the only registry.
- Every fetch attempt is one row in `document_fetch_sessions` (`provider`, `document_keys` text[] or NULL, `status`, `error`, `otp_requested_at`, `created_at`, `updated_at`). Failures store their text in `error`; the "no documents on site" case is recognised by the `NO_DOCUMENTS_ERROR_PREFIX` prefix (`types.ts`).
- The admin UI is hash-routed (`web/src/components/admin/route.ts`), one component per screen under `web/src/components/admin/`, tabs in `AdminDashboard.tsx`, Hebrew labels in `web/src/i18n.tsx`, API calls in `web/src/api.ts`. Admin routes live in `src/api/router.ts` behind `requireAdmin`, handlers in `src/api/admin.ts`.
- Dashboard convention (memory, `feedback_admin_dashboard_scales`): the main overview shows aggregates only; detail lives on its own screen. This change adds its own screen and leaves the overview untouched.
- Institutions already have canonical keys and Hebrew names in `institutionsTable.ts` (`altshuler_shaham`, `harel`, `meitav`, `menora_mivtachim`, `migdal`, `mor`, `phoenix`, `clal`, `infinity`, `analyst`, `yelin_lapidot`).

## Goals / Non-Goals

**Goals:**
- One read-only admin screen fed by one aggregate query. No new tables, no writes, no migration.
- The "built" badge comes from the provider registry, so later provider work needs no dashboard edit.
- The catalog of target sites is explicit code, reviewed once, easy to extend.

**Non-Goals:**
- Building any new fetch provider or browser flow.
- Alerting or anomaly rows for failing sites (the audit/alerts system is untouched).
- Per-client drill-down from a card (a later change can link to the client's conversation).
- Counting local mock fetches differently from real ones (`DOCUMENT_FETCH_MOCK` rows look the same in the table; local dev only).

## Decisions

1. **Catalog as a code module, keyed by institution key + product.**
   New `src/agents/declarationOfCapital/documentFetch/accessCatalog.ts` exports `ACCESS_CATALOG: readonly AccessEntry[]` with `{ group: 'pension' | 'study_fund' | 'other', site: <institution key>, product: 'pension_annual' | 'study_fund_annual' | 'form106', nameHe }`. `nameHe` is taken from `institutionsTable.ts` (`nameHe`) so spelling stays consistent with file names. The tax authority is not an institution; its entry carries its own Hebrew name.
   *Alternative:* derive the list from `institutionsTable.ts` by category. Rejected: that table lists ~80 bodies including old employer funds; the owner's target list is a specific set of 11 managers.

2. **Provider id = site key.** Today's provider ids already equal the institution keys (`altshuler_shaham`, `harel`). The design makes this a rule: a future provider for Meitav has id `meitav`. `built` = `listProviderSpecs().some(p => p.id === entry.site && p.documents.some(d => d.key === entry.product))`. `israel_tax_authority` keeps its id; its catalog entry uses that same key as `site`.

3. **One SQL aggregate, bucketed in SQL by Israel calendar day.** A single query over `document_fetch_sessions` grouped by `provider` and unnested document key, filtered to rows that reached the site (`status IN ('logging_in','verifying','downloading','delivered','failed') OR otp_requested_at IS NOT NULL`), returning `total`, `today`, `last7`, `last30` with `created_at AT TIME ZONE 'Asia/Jerusalem'` against `(now() AT TIME ZONE 'Asia/Jerusalem')::date`. NULL `document_keys` is expanded in code, not SQL: the query returns a `NULL` key bucket per provider and the handler adds it to every product the provider offers. Rows whose provider or key is not in the catalog are ignored.
   *Alternative:* load all sessions and count in JavaScript. Rejected: unbounded over time; the aggregate is one small result set regardless of history.

4. **Health from the last two finished sessions, fetched per provider with `DISTINCT ON`-style ranking.** A second query returns, per `(provider, key)`, the two newest rows with `status IN ('delivered','failed')` ordered by `updated_at DESC`, with `status`, `error`, `updated_at`. A `failed` row whose `error` starts with `NO_DOCUMENTS_ERROR_PREFIX` is treated as a success. Health rule as in the spec. The newest row (whatever it is) also feeds "last access" time and outcome; `expired`/`cancelled` are shown there as "client did not finish" but never change health.
   *Alternative:* failure rate over 7 days. Rejected: with a handful of fetches a week one failure would swing the rate; "last two" matches how an admin actually judges a site.

5. **Response shape.** `GET /api/admin/site-access` → `{ groups: [{ key, nameHe, builtCount, size, totalAccesses, entries: [{ site, product, nameHe, built, counts: { total, today, last7, last30 }, health: 'no_data'|'healthy'|'warning'|'failing', last: { at, outcome: 'delivered'|'failed'|'no_documents'|'abandoned', error } | null }] }] }`. All labels for health/outcome/built are translated in the web app's `i18n.tsx`, not by the server.

6. **UI: cards in three sections, matching STYLE.md's card rule** (big title, small inner data). Each card: site name, two badges (built / health), a 4-cell count strip, one muted line for the last access. Reuse the existing badge and card CSS classes (`badge`, `badge-danger`, `client-card` family) before adding any new class. No chart: counts are per-window numbers, not series.

## Risks / Trade-offs

- [Catalog and provider ids drift] A future provider registered under an id that is not an institution key will never show as built. → `accessCatalog.ts` has a unit test that every registered provider id matches a catalog `site`, so the test fails on drift.
- [Time-zone edge] A session at 23:50 Israel time shows under "today" for ten minutes, then under "last 7 days". → Accepted; it is the calendar-day definition the spec states.
- [Pre-login failures count as accesses] A `failed` row with "no portal credentials on file" never touched the site but counts as an access and as a failure. → Accepted for now (rare: the offer is only made when credentials resolve). Noted as a follow-up: exclude by error text if it ever shows up in health.
- [Altshuler one session, two products] One Altshuler login counts under both product cards, so the two cards' totals do not add up to the number of logins. → The group header shows the group's own total; the proposal text says one access per product on purpose.

## Migration Plan

- No schema change. Deploy with the next release; the screen reads existing rows from the first load.
- Rollback = remove the tab; nothing persists.
