## Context

See proposal.md — Why. The fetch machinery is provider-structured: a runner-side `DocumentFetchProvider` (`src/browserRunner/`, drives one Playwright page: `startLogin` → `submitOtp` → `downloadDocuments`) and a worker-side `FetchProviderSpec` (`taxFetch/providers.ts`: document types, credentials, canned texts, delivery wording). Sessions, OTP relay, delivery, bring-everything consent (`effectiveFetchKeys`), row creation at delivery (`planFetchedRows`, keyed on `takesAllDocuments` + `catalogTypeKey` + `siteNameHe`), the prompt block and the site-access screen are generic and need no change. Migdal (`migdal.ts`, six code boxes, filter rounds) and Meitav (`meitav.ts`, MUI pickers) are the closest templates.

What was observed live on 2026-11-24 in the owner's own account (the owner typed the id, the phone and the code; Claude confirmed every click; the only source for the handles below):

- **Login page** `https://www.menoramivt.co.il/customer-login/` (React / Material-UI, Next.js, title "כניסה לאיזור האישי"). One form: `input#id-num` (type=tel, maxlength 9), `input#email-phone-num` (ONE field, phone or email, the full number — no prefix dropdown), `button.submit-btn[type=submit]` "שלחו לי קוד בהודעה"; side buttons "כניסה עם מספר דרכון" (passport) and "רוצה לקבל קוד בשיחה טלפונית" (code by voice call) — both unused. Submitting POSTs `/customer-login/api/v1/auth-login` and swaps the form in place (same URL) for the code screen.
- **Code screen** (same URL): text "שלחנו עכשיו SMS למספר 050-XXXXXXX. מה הקוד שמופיע בו?", six boxes `input#otp-input-1` … `#otp-input-6` (type=tel; box 1 has maxlength 6 — a paste target — the others maxlength 1), `button.submit-btn[type=submit]` "אישור", a countdown `span.timer` next to "הקוד בדרך…" (starts near 52 s; what follows it — a resend link — was not observed). The wrong-code markup was NOT observed. Success lands on `https://www.menoramivt.co.il/personal/dashboard/` (title "מנורה - המוצרים שלי", header "התנתקות | <id>", product cards for the pension and the study fund with "הורדת דו"ח צבירות"). One login attempt "got stuck" mid-crawl (the code screen never advanced); a reload and a fresh login worked.
- **Reports page** `https://www.menoramivt.co.il/personal/reports/` ("הדוחות שלי" / "הדוחות והמסמכים שלי"; works as a direct navigation once logged in). A page note says "אישור מס והצהרת הון נמצאים בדוח השנתי". Three Material-UI Selects, each a hidden native input `input.MuiSelect-nativeInput` (ids: `#reportType`, then two without id) with a clickable `[role=button]` whose `aria-labelledby` starts with `label-reportType`, `label-businessLines`, `label-years`; opening one shows a `[role=listbox]` (`ul.MuiMenu-list`):
  - סוג דוח: `li[role=option][data-value=…]` — `Yearly-Short` "שנתי מקוצר / אישור מס והצהרת הון", `Yearly` "שנתי מפורט / אישור מס והצהרת הון", `accumulationReports` "דוח צבירות", `Q1`–`Q3`, `M01`–`M12`, `insuranceDetails`, `vehicleHistory`, `exemptLiableReport`, `report161`, `Compensation806`.
  - תחום (multi-select, `li[role=checkbox][data-value=<Hebrew label>]`): "כל התחומים", "פנסיה", "גמל והשתלמות", "ביטוח חיים", "ביטוח בריאות". Its value resets when the report type changes. The native input then reads "פנסיה,גמל והשתלמות".
  - שנה (multi-select, up to 3, `li[role=checkbox][data-value=<year>]`): rendered only after a report type is chosen; a fixed range 2025 down to 2005 (the site's, not the account's). Not shown for `accumulationReports`.
  - `button#filter-box-submit` "בצע סינון" → `POST /personal/reports/api/v1/get-reports` with `{"years":[2018],"businessLine":["Pension","SocialBenefit"],"reportType":"Yearly-Short"}` → `{"err":null,"data":[{reportType:"Yearly-Short", reportPeriod:"4", reportYear:"2018", productName:"8746", businessLine:"Pension", businessLineDesc:"פנסיה", reportId:"<88-char base64>", fundNum:"", productDescription:"מנורה מבטחים פנסיה מקיפה"}]}`. Empty → the page shows "לצערנו, לא נמצאו תוצאות". `button#filter-box-clear-all` "נקה הכל".
- **Results**: "מציג 1-N רשומות מתוך N"; one `li[class*=ReportItem]` per report with columns סוג הדוח / שנה / מוצר / תחום / לצפייה. The row's main button carries `aria-label="סוג הדוח: דוח שנתי מקוצר שנה: 2018 מוצר: מנורה מבטחים פנסיה מקיפה תחום פנסיה"`; the PDF icon is a `button.MuiIconButton-root` (accessible name "לצפיה"). The owner's 2025 filter answered empty (the products joined in 2026); the 2018 filter listed the one pension row used for the mapping. A study-fund row was not observed (its sector cell is assumed to read "גמל והשתלמות", as the sector option does).
- **Download**: the לצפיה click runs `GET /personal/reports/api/v1/document?reportId=<id>&reportType=Yearly-Short` → `{"err":null,"data":{"file":"<base64 PDF>"}}` (starts `%PDF-1.4`), builds a blob and `window.open(blob:…)` in a new tab (a viewer). This is the tax authority's mechanism, covered by `captureNextPdf`'s blob-popup branch (re-fetches the blob from the opener).
- **Telemetry**: every action POSTs to a UUID path (`/c99a4269-…`) and to `api/v1/bam` — human-cadence pauses as for the other providers.

## Goals / Non-Goals

**Goals:**
- A `menora_mivtachim` provider that mirrors the Migdal/Meitav shape so nothing generic changes.
- One filter round (short annual report × both sectors × the tax year) with every row downloaded through the existing blob-popup capture.

**Non-Goals:**
- The detailed annual report (`Yearly`), quarterly/monthly reports, the accumulation report, the 161 / 806 certificates: out of scope (owner's decision: the short report is the one with the tax certificate).
- The passport login, the voice-call code, pressing the resend control, the site's JSON API as a transport (recorded only so a future change can fall back to it).
- Life and health insurance sectors.

## Decisions

1. **Entry URL = the login page** `https://www.menoramivt.co.il/customer-login/` (static). The provider waits for `#id-num` (90 s).

2. **Login = id + full phone.** `startLogin` requires `idNumber` and `phoneNumber`; the phone is normalized to local form (`972…` → `0…`, spaces/dashes stripped) by a pure `normalizeMenoraPhone` (unit-tested; a non-digit or non-mobile value still goes to the site — the site validates it, unlike Meitav where the prefix dropdown forced a split). `typeHuman` into `#id-num` → Tab → `typeHuman` into `#email-phone-num` → Tab → `humanPause` → click `button.submit-btn` → wait for `#otp-input-1` visible (45 s) = the SMS was sent. Worker `buildCredentials` = `clientIdNumber(client, 'menora_mivtachim')` + `client.wa_phone` → `{ idNumber, phoneNumber }`.

3. **OTP = six boxes, Migdal's method.** Click `#otp-input-1`, `typeHuman` the six digits (auto-advance expected; box 1 also accepts a 6-digit paste), read back all six boxes, fall back to per-box fills when any stayed empty; click `button.submit-btn`. Success = URL contains `/personal/` within 45 s. Timeout with `#otp-input-1` still visible = `OtpRejectedError` (boxes cleared); anything else = login failed. The wrong-code markup is confirmed in the live check and the detection tightened if the site shows a distinct error element. A non-6-digit code → `OtpRejectedError` before typing.

4. **Reports = one filter round.** `page.goto('/personal/reports/')`, wait for `#reportType` (60 s). Open the report-type select through its `[role=button][aria-labelledby^="label-reportType"]`, click `li[role=option][data-value="Yearly-Short"]`, assert the native `#reportType` value. Open the sector select (`aria-labelledby^="label-businessLines"`), click the `li[role=checkbox]` whose `data-value` is "פנסיה", then the one "גמל והשתלמות" (never "כל התחומים": that would include insurance), press Escape, assert the native input reads both. Open the year select (`aria-labelledby^="label-years"`; its absence after the type was set = throw "year filter missing"), read the option texts — a missing tax year throws (the range is the site's: openspec forbids another year) — click the tax year, Escape, assert. Arm `waitForResponse` on `get-reports`, click `#filter-box-submit`, then wait until either a `li[class*=ReportItem]` exists or the no-results text "לא נמצאו תוצאות" shows (30 s); neither = throw. No-results → `NoDocumentsOnSiteError`.

5. **Row reading** = every `li[class*=ReportItem]`: its cells in order (סוג הדוח, שנה, מוצר, תחום) are read from the row's child columns, falling back to parsing the main button's aria-label (`סוג הדוח: … שנה: … מוצר: … תחום …`). A pure `selectMenoraRows(rows, taxYear, seen)` keeps rows whose year cell equals the tax year, maps the sector cell to the kind (`/השתלמות|גמל/` → `study_fund_annual`, `/פנסיה/` → `pension_annual`, anything else skipped and logged), builds the title `"<type> <year> — <product>"`, dedups by `kind|title`. Unit-tested with the observed row and invented study-fund / insurance rows.

6. **Download = `captureNextPdf`** around a click on the row's `button.MuiIconButton-root` (the PDF icon), human-cadence pauses between rows; `filename` = a slug of the title + year, `title` = the row title, `kind` from decision 5; PDF magic check. `captureNextPdf` already closes the viewer popup before the next row.

7. **Worker spec** (`menoraSpec`): id `menora_mivtachim`, `siteNameHe` "מנורה מבטחים", `otpChannel: 'sms'`, `takesAllDocuments: true`; documents `pension_annual` (`MENORA_NAME = /מנורה|menora/i` ∧ `/פנסיה|גמל/` ∧ ¬`/השתלמות/`, `catalogTypeKey: 'pension_provident'`) and `study_fund_annual` (`MENORA_NAME` ∧ `/השתלמות/`, `catalogTypeKey: 'study_fund'`). Delivery wording copies Meitav's product-noun joiner and per-file titles; `fileLabel` = `"<title> — מנורה מבטחים <year>"`. Canned messages mirror Meitav's SMS texts with "מנורה מבטחים". `PortalProvider` gains `'menora_mivtachim'`.

8. **Mock**: `MockTaxFetchClient.downloadDocuments` gets a `menora_mivtachim` branch returning one file per agreed key: pension "דוח שנתי מקוצר <year> — מנורה מבטחים פנסיה מקיפה" (the owner's real row shape), study fund "דוח שנתי מקוצר <year> — מנורה מבטחים השתלמות" (product name taken from the dashboard card; the row itself was not observed).

9. **No new access-catalog entry, no migration, no runner protocol bump**: the catalog already lists `menora_mivtachim` for both products; provider ids are free text in the DB; the runner HTTP contract is unchanged.

10. **Smoke script** `scripts/menoraFetchSmoke.ts <idNumber> <phone> [taxYear]`, same shape as the Meitav one, writing PDFs to `<tmp>/menora-smoke/`. The owner's account has a 2018 pension row, so the whole chain is checkable live with `2018`.

## Risks / Trade-offs

- [Wrong-code behaviour unverified] → inferred detection (boxes still up after the wait), tightened after the live check, as for Migdal.
- [A login attempt stalled once during the crawl] → the generic session TTL fails it as login-failed; the client can start again. If the live check reproduces it, the smoke script's screenshot shows where; no retry logic is built blind.
- [Study-fund row unobserved] → the kind comes from the sector cell with `/השתלמות|גמל/`; an unknown sector is logged and skipped, never mis-tagged.
- [MUI multi-selects] → each pick is asserted on the hidden native input before moving on, so a missed checkbox fails loudly instead of fetching the wrong sector or year; "כל התחומים" is never used.
- [The year list is a fixed range] → a tax year outside it throws (download-failed), inside it with no rows is "no documents" — the two outcomes the spec separates.
- [Telemetry on every action] → human-cadence pauses and the runner's headful Chrome, as for every provider.

## Migration Plan

No DB migration. Deploy = normal push (worker + browser-runner image are built per commit). Rollback = revert the commit; a `menora_mivtachim` session mid-flight on a rolled-back worker fails with "unknown provider", which the existing failure path handles.

## Open Questions

- What the code screen shows after the countdown ends (a resend link?) and the exact wrong-code markup — answered by the live check; they change only the detection details in `menora.ts`.
