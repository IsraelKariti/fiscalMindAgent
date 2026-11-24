## Why

The agent can already log in to three external sites on a client's behalf (Israel Tax Authority, Altshuler Shaham, Harel), and the goal is to reach every pension fund and every study fund manager in Israel. Today nobody can see, in one place, which sites the agent can reach, how often it reaches each one, and whether those logins are currently succeeding. The admin has to grep logs or read per-client traces.

## What Changes

- A new admin screen, "גישה לאתרים" (site access), at `#/site-access`, listing every monitored site access in three groups: pension funds, study funds, other sites (the tax authority).
- The list of monitored accesses is a fixed catalog in code: the nine pension-fund managers and eleven study-fund managers from the owner's target list, plus the tax authority. Each entry is one site × one product (for example "Harel — study fund").
- Each entry shows a **status badge**: built (a fetch provider exists for that site and product) or not built yet.
- Each entry shows **access counts**: total, today, last 7 days, last 30 days. One access = one fetch session row that reached the site (status `logging_in` or later).
- Each entry shows a **health badge** computed from the most recent finished sessions: healthy, warning, failing, or no data yet. Sessions the client abandoned (expired, cancelled) do not affect health.
- Each built entry shows the time and outcome of its last access and, when the last access failed, the stored error text.
- One new admin-only API route, `GET /api/admin/site-access`, that returns the catalog with the counts and health per entry.
- No new fetch providers, no browser work. Crawling the sites and building the tools comes later, in separate changes.

## Capabilities

### New Capabilities
- `admin-site-access`: what the admin site-access screen lists, which counts and badges each entry shows, and how the counts and the health badge are computed from fetch sessions.

### Modified Capabilities
- none. `document-fetch` is unchanged: no fetch behaviour changes, only a read-only view over its session rows.

## Impact

- `src/agents/declarationOfCapital/taxFetch/`: new `accessCatalog.ts` (the fixed list of monitored sites × products) and a query helper that aggregates `tax_fetch_sessions` per provider and document key.
- `src/api/admin.ts` + `src/api/router.ts`: one new admin route.
- `web/src/components/admin/`: new `AdminSiteAccess.tsx`, a new `siteAccess` screen in `route.ts`, a new tab in `AdminDashboard.tsx`, Hebrew labels in `i18n.tsx`, `api.ts` client call.
- No migration: everything is derived from existing `tax_fetch_sessions` columns (`provider`, `document_keys`, `status`, `error`, `created_at`, `updated_at`).
- `docs/agents.md`: one paragraph on the new admin screen.
