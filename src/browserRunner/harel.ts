import type { FrameLocator, Page } from 'playwright';
import { debugShot, humanPause, typeHuman } from './launch.js';
import { logger } from '../util/logger.js';
import {
  NoDocumentsOnSiteError,
  OtpRejectedError,
  requireCredential,
  type DocumentFetchProvider,
  type FetchedDocument,
  type PortalCredentials,
} from './providerTypes.js';

const LOGIN_URL =
  'https://www.harel-group.co.il/Pages/login-page/Login.aspx?LoginOriginatingAction=PersonalInfoPage&isshowlogin=true&Source=%2fpersonal-info&Type=PortalOTP';
/** The פעולות נפוצות menu's "לצפות בדוחות שנתיים" target; also works as a direct navigation. */
const ANNUAL_REPORTS_URL = 'https://www.harel-group.co.il/CustomerRouting.ashx?action=14&topic=404';

/**
 * The reports list only renders inside the site's DESKTOP layout — a narrow
 * window gets the mobile layout, whose header has no פעולות נפוצות menu at all
 * (bitten during live exploration). Force a desktop-sized viewport.
 */
const DESKTOP_VIEWPORT = { width: 1680, height: 950 };

/** Filter values on the reports app (native selects, verified live 2026-07-27). */
const SECTOR_OPTION_LABEL = 'גמל והשתלמות';
const ANNUAL_PERIOD_LABEL = 'שנתי';

/** Hard cap on result pages walked, against a pager that never disables. */
const MAX_RESULT_PAGES = 30;

/** How long the table gets to reflect a filter/pagination round-trip. */
const FILTER_SETTLE_MS = 30_000;

/** One row of the reports table, keyed by the site's own per-document id. */
interface ReportRow {
  /** showFile(<docId>, …) argument — unique per document in the session. */
  docId: string;
  /** showFile(<docId>, '<sessionId>') second argument — the DimutWebDocs jsessionid the retrieval URL is built from. */
  sessionId: string;
  sector: string;
  yearText: string;
  docType: string;
  accountNumber: string;
}

/**
 * Harel (הראל ביטוח ופיננסים) personal area — study-fund annual reports.
 * Whole flow verified LIVE 2026-07-27 with the user driving the OTP:
 *
 * 1. Login: harel-group.co.il PortalOTP page auto-opens an `.otp-login` modal —
 *    #uid (ת"ז), #phone, #otp-channel-sms radio, המשך button. Submitting sends
 *    the SMS and swaps the modal to a single #otp field (autocomplete
 *    one-time-code) + המשך. Success navigates to
 *    /personal-info/my-harel/Pages/client-view.aspx.
 * 2. Overlays: a privacy-policy dialog (ZA_CAMP campaign, button "הבנתי, תודה")
 *    and a bottom cookie bar can cover the page — both must be dismissed.
 * 3. Navigation: header nav button פעולות נפוצות opens on CLICK (not hover) →
 *    link "לצפות בדוחות שנתיים" → quarter-reports.aspx, whose report list is a
 *    cross-origin iframe#quarter-reports (www.hrl.co.il DimutWebDocs JSP app).
 *    The iframe's URL becomes empty after its ticket exchange, so it is always
 *    located via the iframe ELEMENT, never by frame URL.
 * 4. Filters: native selects #madorCurrentValue (תחום; גמל והשתלמות),
 *    #repType (תקופה; שנתי = value '31/12/'), #repYear (שנה; value = the year
 *    string) — options picked by their visible label, NEVER by position. The
 *    selects have no change handlers: filtering runs server-side (getDimutTable
 *    AJAX), triggered by the app's חפש button (or its document-level Enter-key
 *    handler as fallback). The values are set, the search is triggered, and the
 *    table is polled until every row matches the requested sector+year (a
 *    failed filter must never silently download another year's documents).
 * 5. Rows/downloads: table#results, one `a[onclick="showFile(docId,'sid')"]`
 *    per row. The document is NOT taken by clicking the link: showFile opens a
 *    top-level popup navigation, and Harel's server answers those with HTTP 500
 *    in an automated browser (bot-defense on the navigation path; diagnosed
 *    2026-08-03). The identical URL fetched as a same-origin XHR from inside the
 *    reports iframe returns 200 application/pdf, so each document is pulled that
 *    way (see fetchDocumentPdf). The site names every file dimutWeb.PDF, so
 *    filenames are synthesized from row metadata. docId dedups rows across pages.
 * 6. Pagination: #pagination_holder, li.next → AJAX page flip; the li gains
 *    class "disable" on the last page. 10 rows per page.
 *
 * A client can hold several study funds and Harel names report documents freely
 * (דוח תקופתי מקוצר / דוחות תקופתיים / אישור מס…), so EVERY row the filters
 * produce is downloaded — nothing is matched by document name.
 */
export const harelProvider: DocumentFetchProvider = {
  id: 'harel',

  async startLogin(page: Page, credentials: PortalCredentials): Promise<void> {
    const idNumber = requireCredential(credentials, 'idNumber', 'harel');
    const phoneNumber = normalizePhone(requireCredential(credentials, 'phoneNumber', 'harel'));

    // Desktop layout is a hard requirement (see DESKTOP_VIEWPORT).
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    // isshowlogin=true opens the OTP login modal on load. The SharePoint page
    // can take well over a minute to render it (observed 2026-08-02, ~40s+ in a
    // regular browser too), so this gets the same budget as the goto.
    await page.waitForSelector('#uid', { state: 'visible', timeout: 120_000 });
    await debugShot(page, 'harel-01-page-loaded');

    await humanPause(page, 2_000, 6_000); // "reading" the modal before typing
    await typeHuman(page, page.locator('#uid'), idNumber);
    await page.keyboard.press('Tab');

    // Code channel: SMS to the client's mobile (the נייד radio, the default).
    const smsRadio = page.locator('#otp-channel-sms');
    if (!(await smsRadio.isChecked().catch(() => false))) await smsRadio.check().catch(() => undefined);
    await typeHuman(page, page.locator('#phone'), phoneNumber);
    await page.keyboard.press('Tab');
    await debugShot(page, 'harel-02-credentials-filled');

    // המשך sends the SMS and swaps the modal to the code-entry step (#otp).
    await humanPause(page);
    await page.locator('.otp-login button', { hasText: 'המשך' }).first().click();
    await page.waitForSelector('#otp', { state: 'visible', timeout: 45_000 });
    await debugShot(page, 'harel-03-otp-screen');
  },

  async submitOtp(page: Page, otp: string): Promise<void> {
    await typeHuman(page, page.locator('#otp'), otp);
    await debugShot(page, 'harel-04-otp-filled');

    // Short pause only: the SMS code expires within minutes, so the submit
    // must not sit behind a long human-cadence delay.
    await humanPause(page, 1_000, 3_000);
    await page.locator('button.contained.primary', { hasText: 'המשך' }).first().click();

    // Success leaves Login.aspx for the personal area (client-view.aspx). A
    // wrong code keeps the modal up — its exact error markup is unverified, so
    // rejection is inferred from still being on the login page with #otp alive.
    const outcome = await Promise.race([
      page
        .waitForURL((url) => !url.href.includes('Login.aspx') && url.href.includes('personal-info'), { timeout: 45_000 })
        .then(() => 'ok' as const),
      page.waitForTimeout(45_000).then(() => 'timeout' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome === 'timeout') {
      if (await page.locator('#otp').isVisible().catch(() => false)) {
        // Clear the field so the next code can be typed into the same modal.
        await page.locator('#otp').click().catch(() => undefined);
        await page.keyboard.press('Control+A').catch(() => undefined);
        await page.keyboard.press('Delete').catch(() => undefined);
        throw new OtpRejectedError('Harel rejected the one-time code');
      }
      throw new Error('login did not complete: the personal area did not load within 45s');
    }
    await debugShot(page, 'harel-05-authenticated');
  },

  async downloadDocuments(page: Page, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    // Single document type (study_fund_annual) — documentKeys carries no extra
    // information; the גמל והשתלמות + year filters define the set.
    const year = String(opts.taxYear);

    await dismissOverlays(page);
    await debugShot(page, 'harel-06-personal-area');

    // פעולות נפוצות → לצפות בדוחות שנתיים. The nav button's FIRST click often
    // only focuses it and the second click opens the menu (verified live), so
    // keep clicking until the report link shows. Falls back to the menu
    // entry's direct URL if the menu markup shifts.
    await humanPause(page); // settle on the personal area before navigating
    try {
      const navButton = page.locator('button', { hasText: 'פעולות נפוצות' }).filter({ visible: true }).first();
      const reportsLink = page.locator('a', { hasText: 'לצפות בדוחות שנתיים' }).filter({ visible: true }).first();
      for (let attempt = 0; attempt < 4 && !(await reportsLink.isVisible().catch(() => false)); attempt++) {
        await navButton.click({ timeout: 10_000 });
        await page.waitForTimeout(1_200);
      }
      await humanPause(page, 1_000, 4_000); // scan the open menu before picking the link
      await reportsLink.click({ timeout: 5_000 });
    } catch {
      logger.warn('harel fetch: nav menu path failed, navigating directly to the reports URL');
      await page.goto(ANNUAL_REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await page.waitForURL((url) => url.href.includes('quarter-reports'), { timeout: 60_000 });

    // The reports app iframe; located by element — its frame URL goes empty
    // after the JSP ticket exchange.
    const reports = page.frameLocator('#quarter-reports');
    await reports.locator('#madorCurrentValue').waitFor({ state: 'visible', timeout: 60_000 });
    await debugShot(page, 'harel-07-reports-app');

    // Filters, picked by visible label (the year by its text, never by index).
    // A missing year option fails loudly here instead of downloading another
    // year's documents.
    await humanPause(page); // "reading" the reports page before filtering
    await reports.locator('#madorCurrentValue').selectOption({ label: SECTOR_OPTION_LABEL });
    await humanPause(page, 1_000, 4_000);
    await reports.locator('#repType').selectOption({ label: ANNUAL_PERIOD_LABEL });
    await humanPause(page, 1_000, 4_000);
    await reports.locator('#repYear').selectOption({ label: year });
    // Snapshot before filtering: whether the table held anything pre-Enter is
    // what tells a genuinely-empty result apart from a filter that never ran
    // (the ACI container's logs die with it, so this also rides the error text).
    const preFilterRows = await readRows(reports).catch(() => [] as ReportRow[]);
    logger.info('harel fetch: pre-filter table state', {
      year,
      rows: preFilterRows.length,
      sample: preFilterRows.slice(0, 3).map((r) => `${r.sector}|${r.yearText}`),
    });
    // No change handlers on the selects — the search runs server-side
    // (getDimutTable AJAX). Prefer the app's dedicated חפש button, clicked like
    // a person would; the document-level Enter handler (keyCode 13) stays as a
    // fallback if the button's markup shifts. The watcher is armed BEFORE the
    // trigger so the round-trip can't slip past it.
    await humanPause(page, 2_000, 8_000);
    let filterAnswered = watchFilterRoundTrip(page);
    await triggerSearch(reports);
    await waitForFilteredRows(page, reports, year, {
      filterAnswered,
      preFilterRowCount: preFilterRows.length,
      initialFilter: true,
    });
    await debugShot(page, 'harel-08-filtered');

    // Walk every result page, downloading every row; docId dedups across pages.
    const docs: FetchedDocument[] = [];
    const seenDocIds = new Set<string>();
    for (let resultPage = 1; resultPage <= MAX_RESULT_PAGES; resultPage++) {
      const rows = await readRows(reports);
      logger.info('harel fetch: result page scanned', { year, resultPage, rows: rows.length });

      for (const row of rows) {
        if (seenDocIds.has(row.docId)) continue;
        seenDocIds.add(row.docId);

        // The site names every download dimutWeb.PDF, so the filename is
        // synthesized from the row: document type + account + year.
        const filename = `${slug(row.docType) || 'report'}_${row.accountNumber || row.docId}_${year}.pdf`;
        await humanPause(page, 2_000, 6_000); // brief cadence between XHR retrievals
        const buffer = await fetchDocumentPdf(reports, row.docId, row.sessionId);
        docs.push({
          buffer,
          filename,
          contentType: 'application/pdf',
          title: [row.docType, row.accountNumber ? `חשבון ${row.accountNumber}` : null].filter(Boolean).join(' — ') || null,
          kind: 'study_fund_annual',
        });
        logger.info('harel fetch: document captured', {
          year,
          docId: row.docId,
          docType: row.docType,
          accountNumber: row.accountNumber,
          bytes: buffer.length,
        });
      }
      await debugShot(page, `harel-09-page-${resultPage}-done`);

      // li.next carries class "disable" on the last page.
      const next = reports.locator('#pagination_holder li.next:not(.disable) a').first();
      if (!(await next.isVisible().catch(() => false))) break;
      await humanPause(page);
      filterAnswered = watchFilterRoundTrip(page);
      await next.click();
      await waitForFilteredRows(page, reports, year, {
        filterAnswered,
        preFilterRowCount: rows.length,
        initialFilter: false,
      });
    }

    if (docs.length === 0) {
      throw new Error(`no documents found under ${SECTOR_OPTION_LABEL} for year ${year}`);
    }
    return docs;
  },
};

/** Normalizes an Israeli mobile to the site's local 10-digit form: 972506839593 / +972… → 0506839593. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.startsWith('972')) return '0' + digits.slice(3);
  return digits;
}

/**
 * Closes the overlays the personal area shows on arrival: the ZA_CAMP privacy
 * dialog ("הבנתי, תודה") and the bottom cookie bar. Best-effort; never throws.
 */
async function dismissOverlays(page: Page): Promise<void> {
  await page.waitForTimeout(2_000); // the campaign dialogs render a beat after the page
  const gotIt = page.locator('button', { hasText: 'הבנתי' }).filter({ visible: true }).first();
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click().catch(() => undefined);
  const cookieClose = page.locator('[id^="ZA_CAMP_BUBBLE_CLOSE_BUTTON"]').first();
  if (await cookieClose.isVisible().catch(() => false)) await cookieClose.click().catch(() => undefined);
  await page.waitForTimeout(500);
}

/** The current #results rows, with the showFile docId pulled from each row's link. */
async function readRows(reports: FrameLocator): Promise<ReportRow[]> {
  const rows = (await reports.locator('#results tbody tr').evaluateAll((trs) =>
    trs.map((tr: any) => {
      const cells = Array.from(tr.querySelectorAll('td') as ArrayLike<any>).map((td: any) =>
        String(td.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      const onclick = tr.querySelector('a[onclick]')?.getAttribute('onclick') ?? '';
      // onclick is `javascript:showFile(<docId>,'<sessionId>')`.
      const call = /showFile\((\d+)\s*,\s*['"]([^'"]+)['"]/.exec(onclick);
      const docId = call?.[1] ?? null;
      const sessionId = call?.[2] ?? null;
      // Column order (verified live): תחום, שנה, סוג דוח, ת"ז, שם מבוטח, פוליסה/חשבון, צפייה.
      return {
        docId,
        sessionId,
        sector: cells[0] ?? '',
        yearText: cells[1] ?? '',
        docType: cells[2] ?? '',
        accountNumber: cells[5] ?? '',
      };
    }),
  )) as Array<ReportRow & { docId: string | null; sessionId: string | null }>;
  return rows.filter((r): r is ReportRow => r.docId !== null && r.sessionId !== null);
}

/**
 * Retrieves one document's PDF bytes. showFile is NOT clicked: its top-level
 * popup navigation is answered with HTTP 500 by Harel's bot-defense in an
 * automated browser, while the same URL fetched as a same-origin XHR from inside
 * the reports iframe returns 200 application/pdf (diagnosed live 2026-08-03).
 * The fetch runs in the iframe's www.hrl.co.il context so the relative URL,
 * cookies, and the page's `csrftoken` global all resolve exactly as the site's
 * own showFile() would build them.
 */
async function fetchDocumentPdf(reports: FrameLocator, docId: string, sessionId: string): Promise<Buffer> {
  const result = (await reports.locator('body').evaluate(
    async (_el, args: { docId: string; sessionId: string }) => {
      const g = globalThis as unknown as { csrftoken?: unknown };
      const token = typeof g.csrftoken !== 'undefined' ? String(g.csrftoken) : '';
      const url = `showFile;jsessionid=${args.sessionId}?docId=${args.docId}&csrfkey=${token}`;
      const res = await fetch(url, { credentials: 'include' });
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return { status: res.status, contentType: res.headers.get('content-type') ?? '', base64: btoa(bin) };
    },
    { docId, sessionId },
  )) as { status: number; contentType: string; base64: string };

  if (result.status !== 200 || !result.contentType.includes('application/pdf')) {
    throw new Error(`harel showFile returned ${result.status} ${result.contentType || '(no content-type)'} for docId ${docId}`);
  }
  return Buffer.from(result.base64, 'base64');
}

/**
 * Runs the filter search: clicks the reports app's חפש button when it's
 * visible, otherwise falls back to the document-level Enter handler on
 * #repYear (both trigger the same getDimutTable AJAX; the Enter path is the
 * one verified live 2026-07-27, the button preferred since 2026-08-03).
 */
async function triggerSearch(reports: FrameLocator): Promise<void> {
  const searchButton = reports
    .locator('button:has-text("חפש"), input[type="button"][value*="חפש"], input[type="submit"][value*="חפש"], a:has-text("חפש")')
    .filter({ visible: true })
    .first();
  if (await searchButton.isVisible().catch(() => false)) {
    await searchButton.click();
    return;
  }
  logger.warn('harel fetch: no visible search button, falling back to Enter on #repYear');
  await reports.locator('#repYear').press('Enter');
}

/**
 * Resolves with the HTTP status of the reports app's next answer (the
 * getDimutTable AJAX lives on the iframe's www.hrl.co.il origin), or null when
 * nothing answered within the settle window. Arm BEFORE the Enter/click that
 * triggers the round-trip.
 */
function watchFilterRoundTrip(page: Page): Promise<number | null> {
  return page
    .waitForResponse((res) => /hrl\.co\.il/i.test(res.url()) || /dimut/i.test(res.url()), { timeout: FILTER_SETTLE_MS })
    .then((res) => res.status())
    .catch(() => null);
}

/**
 * Waits for the AJAX-rendered table to show only rows matching the requested
 * sector + year. This doubles as the filter's success check: if the Enter
 * round-trip failed, this throws instead of letting the caller download
 * whatever mix the table happened to hold. An empty table is ambiguous on its
 * own — the round-trip watcher disambiguates: query answered + still empty
 * means the client genuinely has no matching documents (NoDocumentsOnSiteError,
 * only on the initial filter — mid-pagination emptiness is a site bug), while
 * no answer at all means the search was never triggered.
 */
async function waitForFilteredRows(
  page: Page,
  reports: FrameLocator,
  year: string,
  diag: { filterAnswered: Promise<number | null>; preFilterRowCount: number; initialFilter: boolean },
): Promise<void> {
  const deadline = Date.now() + FILTER_SETTLE_MS;
  let lastRows: ReportRow[] = [];
  for (;;) {
    lastRows = await readRows(reports).catch(() => [] as ReportRow[]);
    if (
      lastRows.length > 0 &&
      lastRows.every((r) => r.yearText.includes(year) && r.sector.includes(SECTOR_OPTION_LABEL))
    ) {
      return;
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(1_000);
  }
  // The watcher's timeout equals the loop's, so it has settled by now.
  const answered = await diag.filterAnswered;
  const context = `pre-filter rows: ${diag.preFilterRowCount}, filter response: ${answered === null ? 'none' : `HTTP ${answered}`}`;
  if (lastRows.length === 0 && diag.initialFilter && answered !== null && answered < 400) {
    throw new NoDocumentsOnSiteError(
      `the site lists no documents under ${SECTOR_OPTION_LABEL}/${ANNUAL_PERIOD_LABEL}/${year} — the filter query was answered and the table stayed empty (${context})`,
    );
  }
  const lastState =
    lastRows.length === 0
      ? answered === null
        ? 'no rows and the search query never fired'
        : 'no rows'
      : `rows: ${lastRows.map((r) => `${r.sector}|${r.yearText}`).slice(0, 5).join(', ')}`;
  throw new Error(`reports table did not settle on ${SECTOR_OPTION_LABEL}/${year} within 30s (${lastState}; ${context})`);
}

/** A filename-safe slug of a Hebrew document-type cell. */
function slug(text: string): string {
  return text.replace(/[^\w֐-׿]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}
