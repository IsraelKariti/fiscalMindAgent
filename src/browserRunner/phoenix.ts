import type { Download, Page } from 'playwright';
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

/**
 * The personal area's entry point — what the public site's "לאיזור האישי"
 * links open. An unauthenticated visit redirects to the Auth0 universal login
 * (auth.fnx.co.il/u/login?state=…, a one-time state value, so the login URL
 * itself is never hardcoded). Headless Chrome gets a CloudFront 403 here; the
 * runner's headful launch (launch.ts) is what the site accepts.
 */
const ENTRY_URL = 'https://my.fnx.co.il/';
/** The reports list ("דוחות ומסמכים" → tab "דוחות"); works as a direct navigation once logged in. */
const REPORTS_URL = 'https://my.fnx.co.il/mails/reports';

/** Login form fields — the Angular form has no ids/names, placeholders are the handles (verified live 2026-11-24). */
const ID_INPUT = 'input[placeholder="מספר ת.ז*"]';
const CONTACT_INPUT = 'input[placeholder="טלפון נייד או כתובת מייל*"]';
const SEND_CODE_BUTTON_TEXT = 'שלחו לי קוד כניסה';
const OTP_SUBMIT_BUTTON_TEXT = 'כניסה';
/** The code page's path on the Auth0 host. */
const OTP_PAGE_MARKER = 'mfa-sms-challenge';

/** Sector (תחום) words that decide a row's document kind. */
const PENSION_SECTOR_WORD = 'פנסיה';
const STUDY_FUND_SECTOR_WORD = 'השתלמות';
/** Report names carrying this word are quarterly reports — never wanted. */
const QUARTERLY_WORD = 'רבעון';

/** Hard cap on list pages walked, against a pager that never disables. */
const MAX_LIST_PAGES = 40;
/** How long one page flip gets to show the next page number. */
const PAGE_FLIP_SETTLE_MS = 10_000;
/** Per-click download window; the site POSTs document-content then saves the PDF. */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** One row of the reports list as the page shows it. */
export interface PhoenixRow {
  /** Column תאריך — the publication date, NOT the report year; never used for selection. */
  dateText: string;
  /** Column שם הדוח, e.g. "דוח שנתי מלא 2024". */
  name: string;
  /** Column תחום, e.g. "גמל והשתלמות" / "חיים/פנסיה". */
  sector: string;
}

/** A row chosen for download, with the document type it satisfies. */
export interface SelectedPhoenixRow extends PhoenixRow {
  /** Index of the row within its page — the download control is located by it. */
  index: number;
  kind: 'pension_annual' | 'study_fund_annual';
}

/** The document kind a sector (תחום) cell maps to, or null for sectors the fetch ignores (e.g. ביטוח כללי). */
export function phoenixKindOfSector(sector: string): SelectedPhoenixRow['kind'] | null {
  if (sector.includes(PENSION_SECTOR_WORD)) return 'pension_annual';
  if (sector.includes(STUDY_FUND_SECTOR_WORD)) return 'study_fund_annual';
  return null;
}

/**
 * The owner's selection rule (openspec `phoenix-fetch`): a row is taken when
 * its sector maps to a kind the client agreed to, its NAME contains the tax
 * year as a four-digit string (the date column is the publication date and is
 * ignored), and the name is not a quarterly report. Rows are kept in page
 * order and never deduplicated — a client with several policies gets several
 * rows with the same name, and each is a distinct document.
 */
export function selectPhoenixRows(rows: PhoenixRow[], taxYear: number, documentKeys: string[]): SelectedPhoenixRow[] {
  const year = String(taxYear);
  const wanted = new Set(documentKeys);
  const selected: SelectedPhoenixRow[] = [];
  rows.forEach((row, index) => {
    const kind = phoenixKindOfSector(row.sector);
    if (!kind || !wanted.has(kind)) return;
    if (!row.name.includes(year) || row.name.includes(QUARTERLY_WORD)) return;
    selected.push({ ...row, index, kind });
  });
  return selected;
}

/**
 * Phoenix (הפניקס) personal area — pension and study-fund annual documents.
 * Flow mapped LIVE 2026-11-24 in the owner's own account (the owner typed the
 * id, phone and code; everything below is what the pages showed):
 *
 * 1. Login: my.fnx.co.il redirects to the Auth0 universal login hosting an
 *    Angular form: identity-type dropdown (default ת.ז — left alone), ת.ז input,
 *    one "phone or email" input, button "שלחו לי קוד כניסה" (SMS/email code) and
 *    an alternative "שלחו לי קוד בשיחת טלפון" (unused). Submitting moves to
 *    /u/mfa-sms-challenge: a modal "קוד זיהוי חד פעמי" with one text input and
 *    a "כניסה" button; resend is "עדיין מחכה לקוד? שלח שוב". Success lands on
 *    https://my.fnx.co.il/ (title "הפניקס | עמוד הבית"). The wrong-code markup
 *    was NOT observed — rejection is inferred from the code input still being
 *    up after the wait (same inference as Harel).
 * 2. Reports: /mails/reports. Rows are [role=row] (the first is the header)
 *    with [role=cell] cells: date | name (an h3) | תחום; then a view button
 *    (aria-label "לחץ לצפיה בקובץ<name>") and the download control, an
 *    app-icon[role=button] with aria-label "לחץ להורדת קובץ<name>". 8 rows per
 *    page; rows carry no document id. The list is fetched once; paging is
 *    client-side.
 * 3. Page bar: one container holding, in DOM order, an arrow button (= NEXT —
 *    the bar is RTL, so the left arrow moves to higher numbers), the number
 *    buttons (class caption-1), a "…" span, and the previous arrow. The current
 *    page's number button is the only one with a non-zero border. Nothing is
 *    ever disabled, not even on the last page, so the walk stops when the
 *    current number equals the highest number shown.
 * 4. Download: clicking the row's download control POSTs
 *    /api/v1/info/document/document-content and then saves a normal browser
 *    download named "<report name>.pdf" — captured via the download event.
 * 5. The side filters (תחום / סוג / שנה, "הצגת שנים נוספות") exist but are NOT
 *    used: the owner wants the walk to depend on the page bar only, and the
 *    year to come from the report name only.
 */
export const phoenixProvider: DocumentFetchProvider = {
  id: 'phoenix',

  async startLogin(page: Page, credentials: PortalCredentials): Promise<void> {
    const idNumber = requireCredential(credentials, 'idNumber', 'phoenix');
    const phoneNumber = normalizePhone(requireCredential(credentials, 'phoneNumber', 'phoenix'));

    await page.goto(ENTRY_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    // The redirect chain (my.fnx.co.il → auth.fnx.co.il) ends on the form.
    await page.waitForSelector(ID_INPUT, { state: 'visible', timeout: 90_000 });
    await debugShot(page, 'phoenix-01-login-page');

    await humanPause(page, 2_000, 6_000); // "reading" the form before typing
    await typeHuman(page, page.locator(ID_INPUT), idNumber);
    await page.keyboard.press('Tab');
    await typeHuman(page, page.locator(CONTACT_INPUT), phoneNumber);
    await page.keyboard.press('Tab');
    await debugShot(page, 'phoenix-02-credentials-filled');

    // Sends the SMS code and moves to the code page.
    await humanPause(page);
    await page.locator('button', { hasText: SEND_CODE_BUTTON_TEXT }).filter({ visible: true }).first().click();
    await page.waitForURL((url) => url.href.includes(OTP_PAGE_MARKER), { timeout: 45_000 });
    await otpInput(page).waitFor({ state: 'visible', timeout: 15_000 });
    await debugShot(page, 'phoenix-03-otp-screen');
  },

  async submitOtp(page: Page, otp: string): Promise<void> {
    await typeHuman(page, otpInput(page), otp);
    await debugShot(page, 'phoenix-04-otp-filled');

    // Short pause only: the code expires within minutes.
    await humanPause(page, 1_000, 3_000);
    await otpDialog(page).getByRole('button', { name: OTP_SUBMIT_BUTTON_TEXT, exact: true }).first().click();

    // Success leaves the Auth0 host for the personal area. A wrong code keeps
    // the code page up; its error markup is unverified, so rejection is
    // inferred from still being on the code page with the input alive.
    const outcome = await Promise.race([
      page
        .waitForURL((url) => url.hostname === 'my.fnx.co.il', { timeout: 45_000 })
        .then(() => 'ok' as const),
      page.waitForTimeout(45_000).then(() => 'timeout' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome === 'timeout') {
      if (page.url().includes(OTP_PAGE_MARKER) && (await otpInput(page).isVisible().catch(() => false))) {
        // Clear the field so the next code can be typed into the same modal.
        await otpInput(page).click().catch(() => undefined);
        await page.keyboard.press('Control+A').catch(() => undefined);
        await page.keyboard.press('Delete').catch(() => undefined);
        throw new OtpRejectedError('Phoenix rejected the one-time code');
      }
      throw new Error('login did not complete: the personal area did not load within 45s');
    }
    await debugShot(page, 'phoenix-05-authenticated');
  },

  async downloadDocuments(page: Page, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    const { taxYear, documentKeys } = opts;

    await humanPause(page); // settle on the home page before navigating
    await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // The list renders after its own API call; a header-only table means it
    // never came — that is a site/runner failure, not "no documents".
    await page.locator('[role=row]').nth(1).waitFor({ state: 'visible', timeout: 60_000 });
    await debugShot(page, 'phoenix-06-reports-list');

    const docs: FetchedDocument[] = [];
    let previousRows: PhoenixRow[] | null = null;
    for (let walked = 1; walked <= MAX_LIST_PAGES; walked++) {
      const rows = await readRows(page);
      const pager = await readPager(page);
      logger.info('phoenix fetch: list page scanned', {
        taxYear,
        currentPage: pager.current,
        lastPage: pager.last,
        rows: rows.length,
      });
      if (previousRows && pager.current !== null && sameRows(previousRows, rows)) {
        throw new Error(`reports list pager is stuck on page ${pager.current}: the rows did not change after a page flip`);
      }
      previousRows = rows;

      // Download on the page the rows were read from — the row handles go
      // stale after a page flip.
      for (const row of selectPhoenixRows(rows, taxYear, documentKeys)) {
        await humanPause(page, 3_000, 8_000); // human cadence between downloads
        const { buffer, filename } = await captureDownload(page, () => downloadControl(page, row).click({ timeout: 10_000 }));
        docs.push({
          buffer,
          filename: filename || `${slug(row.name) || 'report'}_${taxYear}.pdf`,
          contentType: 'application/pdf',
          title: row.name,
          kind: row.kind,
        });
        logger.info('phoenix fetch: document captured', {
          taxYear,
          page: pager.current,
          name: row.name,
          sector: row.sector,
          kind: row.kind,
          bytes: buffer.length,
        });
      }
      await debugShot(page, `phoenix-07-page-${pager.current ?? walked}-done`);

      if (pager.current === null || pager.last === null || pager.current >= pager.last) break;
      await humanPause(page, 2_000, 6_000);
      await flipToNextPage(page, pager.current);
    }

    if (docs.length === 0) {
      throw new NoDocumentsOnSiteError(
        `the site lists no ${documentKeys.join('/')} document whose name carries ${taxYear} (every page walked)`,
      );
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
 * The code dialog (`role=dialog`, labelled by `acul-mfa-dialog-title`). It
 * opens OVER the login form, which stays in the DOM, so every code-step
 * locator is scoped to it: a page-wide `input[type="text"]` resolved to the
 * ID field underneath (prod session 462d4fe0, 2026-11-28) and a page-wide
 * button containing "כניסה" resolved to the form's "שלחו לי קוד כניסה"
 * (session afde3b7a) — the dialog intercepted both clicks.
 */
function otpDialog(page: Page) {
  return page.locator('[role="dialog"][aria-labelledby="acul-mfa-dialog-title"], [role="dialog"][aria-modal="true"]').first();
}

/** The code dialog's input: the one marked for one-time codes (6 digits, `fnx-mfa-otp-input`). */
function otpInput(page: Page) {
  return otpDialog(page).locator('input[autocomplete="one-time-code"], input.fnx-mfa-otp-input').filter({ visible: true }).first();
}

/** The reports list's data rows (the first [role=row] is the header). */
async function readRows(page: Page): Promise<PhoenixRow[]> {
  return (await page.locator('[role=row]').evaluateAll((rows) =>
    rows.slice(1).map((row: any) => {
      const cells = Array.from(row.querySelectorAll('[role=cell]') as ArrayLike<any>).map((c: any) =>
        String(c.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      // Column order (verified live): תאריך | שם הדוח | תחום | (controls).
      return { dateText: cells[0] ?? '', name: cells[1] ?? '', sector: cells[2] ?? '' };
    }),
  )) as PhoenixRow[];
}

/** The row's download control, by its position among the data rows of the current page. */
function downloadControl(page: Page, row: SelectedPhoenixRow) {
  return page
    .locator('[role=row]')
    .nth(row.index + 1)
    .locator('[role=button][aria-label^="לחץ להורדת קובץ"]')
    .first();
}

/**
 * The page bar: current page = the number button with a border, last page =
 * the highest number shown. Null when the bar is absent (a single page).
 */
async function readPager(page: Page): Promise<{ current: number | null; last: number | null }> {
  return (await page.locator('body').evaluate((body: any) => {
    const text = (b: any): string => String(b.textContent ?? '').trim();
    const numberButtons = Array.from(body.querySelectorAll('button') as ArrayLike<any>).filter(
      (b: any) => /^\d+$/.test(text(b)) && b.classList.contains('caption-1'),
    );
    if (numberButtons.length === 0) return { current: null, last: null };
    const numbers = numberButtons.map((b: any) => Number(text(b)));
    const view = body.ownerDocument.defaultView;
    const currentButton = numberButtons.find((b: any) => parseFloat(view.getComputedStyle(b).borderWidth) > 0);
    return {
      current: currentButton ? Number(text(currentButton)) : null,
      last: Math.max(...numbers),
    };
  })) as { current: number | null; last: number | null };
}

/**
 * Presses the page bar's NEXT control (the first arrow button in the bar — the
 * bar is RTL) and waits until the current page number moved past `from`.
 */
async function flipToNextPage(page: Page, from: number): Promise<void> {
  const anyNumber = page.locator('button.caption-1').filter({ hasText: /^\s*\d+\s*$/ }).first();
  const bar = anyNumber.locator('xpath=..');
  await bar.locator('button').first().click({ timeout: 10_000 });
  const deadline = Date.now() + PAGE_FLIP_SETTLE_MS;
  for (;;) {
    const pager = await readPager(page);
    if (pager.current !== null && pager.current > from) return;
    if (Date.now() > deadline) throw new Error(`reports list did not move past page ${from} within ${PAGE_FLIP_SETTLE_MS / 1000}s`);
    await page.waitForTimeout(500);
  }
}

function sameRows(a: PhoenixRow[], b: PhoenixRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.name === b[i]?.name && row.dateText === b[i]?.dateText && row.sector === b[i]?.sector);
}

/** Clicks (via `trigger`) and returns the single PDF that click downloads. */
async function captureDownload(page: Page, trigger: () => Promise<void>): Promise<{ buffer: Buffer; filename: string }> {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS }), trigger()]);
  const path = await (download as Download).path();
  if (!path) throw new Error('download produced no file');
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(path);
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(`phoenix download is not a PDF (${buffer.length} bytes, starts ${JSON.stringify(buffer.subarray(0, 8).toString('latin1'))})`);
  }
  return { buffer, filename: download.suggestedFilename() };
}

/** A filename-safe slug of a Hebrew report name. */
function slug(text: string): string {
  return text.replace(/[^\w֐-׿]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}
