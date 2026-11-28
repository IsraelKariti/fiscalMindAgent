## Why

A Migdal fetch for tax year 2016 failed in production on 2026-11-28: the year dropdown offers 2019 to 2026 only, so the fetch stopped with nothing. The site does hold the 2016 annual reports. They show up when the year is left on "כל השנים" (seen live in the owner's account the same day). The owner also wants the "אישור מס" document from the same login.

## What Changes

- Year rule for the annual report types ("דוח שנתי", "דוח שנתי מקוצר"): when the tax year is an option of the year dropdown it is selected, as today. When it is not an option, "כל השנים" is selected and only rows titled "לשנת <tax year>" are taken. A missing year no longer fails the fetch.
- New report type "אישור מס" fetched in the same login, after the four annual rounds. Its year dropdown has no "כל השנים", so it runs only when the tax year is an option; otherwise it is skipped and never takes another year.
- "אישור מס" lists the account's product names ("מקפת אישית", "מגדל השתלמות", "בריאות") instead of "פנסיה" / "השתלמות". Each product is sorted by its name into pension or study fund; health and unknown names are skipped.
- Tax certificates are tagged with the same two kinds as the annual reports, so they attach to the same checklist rows.
- Delivery wording says "מסמכים" instead of "דוחות שנתיים" when a tax certificate is among the files. The offered-document description names the tax certificate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `migdal-fetch`: the year rule of the filter rounds changes (all-years fallback instead of failing), a tax-certificate report type is added, and the delivery wording covers a tax certificate.

## Impact

- `src/browserRunner/migdal.ts`: round list, year selection, row selection, product sorting for "אישור מס".
- `src/agents/declarationOfCapital/documentFetch/providers.ts`: Migdal document descriptions and delivery wording.
- `tests/migdalSelect.test.ts`: new cases for the year rule, the strict title check and the product sorting.
- `scripts/migdalFetchSmoke.ts`: unchanged in shape; it is the live check.
- No database change, no new env var, no change to other providers. The browser-runner HTTP contract is unchanged.
