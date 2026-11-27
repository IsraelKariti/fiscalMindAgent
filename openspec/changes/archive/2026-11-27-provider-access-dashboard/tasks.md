## 1. Catalog and built status

- [x] 1.1 Add `src/agents/declarationOfCapital/documentFetch/accessCatalog.ts` with `ACCESS_CATALOG` (9 pension, 11 study-fund, 1 other entry; Hebrew names from `institutionsTable.ts`) and `isBuilt(entry)` reading `listProviderSpecs()`; verify with a unit test that exactly Altshuler pension, Altshuler study fund, Harel study fund and the tax authority are built, and that every registered provider id matches a catalog `site`.

## 2. Aggregation

- [x] 2.1 Add `src/db/queries/siteAccess.ts` with the counts aggregate (per provider × document key, including the NULL-key bucket; filter = reached the site; today / last 7 / last 30 by Israel calendar day) and the last-two-finished query; verify with a DB-backed test that seeds sessions (agreed-only, expired with otp_requested_at, delivered yesterday with two keys, failed no-documents) and checks the buckets.
- [x] 2.2 Add `buildSiteAccessReport()` in `src/agents/declarationOfCapital/documentFetch/siteAccessReport.ts` that joins the catalog, the counts and the health rule (no_data / healthy / warning / failing, no-documents failure = success, NULL keys expanded to all provider products); verify with unit tests for each health scenario in the spec and for the group totals (1/9, 2/11, 1/1 with no sessions).

## 3. API

- [x] 3.1 Add `adminSiteAccess` in `src/api/admin.ts` and `GET /admin/site-access` behind `requireAdmin` in `src/api/router.ts`; verify with `curl` as admin that the JSON has three groups with 9, 11 and 1 entries, and that a non-admin session gets the usual refusal.

## 4. Admin UI

- [x] 4.1 Add the `siteAccess` screen to `web/src/components/admin/route.ts` (`#/site-access`), the `adminSiteAccess()` call and types in `web/src/api.ts`, and the Hebrew labels in `web/src/i18n.tsx` (tab "גישה לאתרים", group titles, built / not built, health names, last-access outcomes, loading, error); verify `npm run typecheck` passes.
- [x] 4.2 Add `web/src/components/admin/AdminSiteAccess.tsx`: three sections with group header (built x of y, total accesses), one card per entry (title, built badge, health badge, 4-cell count strip, last-access line with error text when failed), loading text and error banner; wire the tab into `AdminDashboard.tsx`; verify in the browser that the tab shows 21 cards, the four built ones badge correctly, and a deep link to `#/site-access` opens the screen.

## 5. Docs and wrap-up

- [x] 5.1 Add a short "Site access screen" paragraph to `docs/agents.md` (what it reads, the provider-id-equals-site-key rule for future providers); verify the paragraph renders and the rule is stated.
- [x] 5.2 Run `npm run typecheck` and `npm test`, commit per the Git workflow; verify the push lands on master.
