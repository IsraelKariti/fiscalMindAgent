import type { Page } from 'playwright';
import { debugShot, humanPause, typeHuman } from './launch.js';
import { captureNextPdf } from './pdfCapture.js';
import { logger } from '../util/logger.js';
import {
  NoDocumentsOnSiteError,
  OtpRejectedError,
  requireCredential,
  type DocumentFetchProvider,
  type FetchedDocument,
  type PortalCredentials,
} from './providerTypes.js';

/** Personal-area login — a static URL. */
const LOGIN_URL = 'https://www.menoramivt.co.il/customer-login/';
/** "הדוחות שלי"; works as a direct navigation once logged in. */
const REPORTS_URL = 'https://www.menoramivt.co.il/personal/reports/';
/** Every authenticated page lives under this path; the login lands on /personal/dashboard/. */
const PERSONAL_PATH = '/personal/';

/** Login form handles (crawled live 2026-11-24). */
const ID_INPUT = 'input#id-num';
const PHONE_INPUT = 'input#email-phone-num';
/** The login and the code screen share one form and one submit button ("שלחו לי קוד בהודעה", then "אישור"). */
const SUBMIT_BUTTON = 'button.submit-btn[type="submit"]';
/** The six one-digit code boxes, in order (the first also accepts a 6-digit paste). */
const OTP_BOX_IDS = ['otp-input-1', 'otp-input-2', 'otp-input-3', 'otp-input-4', 'otp-input-5', 'otp-input-6'] as const;

/** Reports page handles — Material-UI Selects opened through their [role=button]. */
const REPORT_TYPE_NATIVE = 'input#reportType';
const LISTBOX = '[role="listbox"]';
const FILTER_BUTTON = 'button#filter-box-submit';
const ROW = 'li[class*="ReportItem"]';
/** The PDF icon inside a row ("לצפיה"). */
const ROW_PDF_BUTTON = 'button.MuiIconButton-root';
const NO_RESULTS_TEXT = 'לא נמצאו תוצאות';
/** The filter's server round trip (POST …/personal/reports/api/v1/get-reports). */
const LIST_API_MARKER = 'get-reports';

/** The report type the fetch takes (owner's decision: the short annual report with the tax certificate). */
const REPORT_TYPE_VALUE = 'Yearly-Short';
/** The sectors the fetch takes, as the site's checkbox values spell them — never life or health insurance. */
const SECTOR_LABELS = ['פנסיה', 'גמל והשתלמות'] as const;

const OTP_WAIT_MS = 45_000;
const PAGE_LOAD_MS = 60_000;
const PICKER_MS = 10_000;
const FILTER_SETTLE_MS = 30_000;

export type MenoraKind = 'pension_annual' | 'study_fund_annual';

/** One result row as the page shows it. */
export interface MenoraRow {
  /** Index of the row among every ROW on the page — the click target. */
  index: number;
  /** The row's main button aria-label: "סוג הדוח: <type> שנה: <year> מוצר: <product> תחום <sector>". */
  label: string;
}

/** The parts of a row's aria-label. */
export interface MenoraRowParts {
  type: string;
  year: string;
  product: string;
  sector: string;
}

/** A row chosen for download. */
export interface SelectedMenoraRow {
  index: number;
  /** "<type> <year> — <product>" — what the document is titled and labelled by. */
  title: string;
  kind: MenoraKind;
}

/**
 * Normalizes a stored phone number to the local form the login form takes
 * (one field, no prefix split): the international form (972…) becomes 0…,
 * spaces, dashes and a leading plus are dropped. The site validates the rest.
 */
export function normalizeMenoraPhone(phone: string): string {
  let normalized = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (normalized.startsWith('972')) normalized = `0${normalized.slice(3)}`;
  return normalized;
}

/** Splits the row's aria-label into its parts, or null when it is not a report row. */
export function parseMenoraRowLabel(label: string): MenoraRowParts | null {
  const m = /סוג הדוח:\s*(.+?)\s+שנה:\s*(\S+)\s+מוצר:\s*(.+?)\s+תחום\s+(.+)$/.exec(label.replace(/\s+/g, ' ').trim());
  if (!m) return null;
  return { type: m[1]!.trim(), year: m[2]!.trim(), product: m[3]!.trim(), sector: m[4]!.trim() };
}

/** The document kind of a row from its sector cell, or null for a sector the fetch does not take. */
export function menoraKindOf(sector: string): MenoraKind | null {
  if (/השתלמות|גמל/.test(sector)) return 'study_fund_annual';
  if (/פנסיה/.test(sector)) return 'pension_annual';
  return null;
}

/**
 * Pure selection (openspec `menora-fetch`): every row whose year is the tax
 * year, tagged by its sector; a row of another year or of a sector the fetch
 * does not take (insurance) is skipped; the same title within a kind is
 * downloaded once.
 */
export function selectMenoraRows(rows: MenoraRow[], taxYear: number, seen: Set<string> = new Set()): SelectedMenoraRow[] {
  const year = String(taxYear);
  const selected: SelectedMenoraRow[] = [];
  for (const row of rows) {
    const parts = parseMenoraRowLabel(row.label);
    if (!parts || parts.year !== year) continue;
    const kind = menoraKindOf(parts.sector);
    if (!kind) continue;
    const title = `${parts.type} ${parts.year} — ${parts.product}`;
    const key = `${kind}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ index: row.index, title, kind });
  }
  return selected;
}

/**
 * Menora Mivtachim (מנורה מבטחים) — personal area, short annual report
 * ("שנתי מקוצר / אישור מס והצהרת הון") for the pension and the study fund.
 * Flow mapped LIVE 2026-11-24 in the owner's own account (the owner typed the
 * id, the phone and the code; everything below is what the pages showed):
 *
 * 1. Login: /customer-login/ (React/MUI, Next.js). input#id-num (type=tel,
 *    maxlength 9), input#email-phone-num (ONE field, phone or email, the full
 *    number), button.submit-btn "שלחו לי קוד בהודעה"; side buttons "כניסה עם
 *    מספר דרכון" / "רוצה לקבל קוד בשיחה טלפונית" (unused). Submit POSTs
 *    /customer-login/api/v1/auth-login and swaps in the code screen (same
 *    URL): "שלחנו עכשיו SMS למספר 050-XXXXXXX", six boxes input#otp-input-1 …
 *    #otp-input-6 (type=tel; box 1 maxlength 6, the others 1), the same
 *    submit button "אישור", a countdown span.timer ("הקוד בדרך…"). The
 *    wrong-code markup was NOT observed — rejection is inferred from the boxes
 *    still being up after the wait. Success lands on /personal/dashboard/.
 * 2. Reports: /personal/reports/ ("הדוחות שלי"). Three MUI Selects, each a
 *    hidden input.MuiSelect-nativeInput beside a [role=button] whose
 *    aria-labelledby starts with label-reportType / label-businessLines /
 *    label-years; the open menu is a [role=listbox]. Report type options
 *    li[role=option][data-value]: Yearly-Short "שנתי מקוצר / אישור מס והצהרת
 *    הון", Yearly "שנתי מפורט / …", accumulationReports, Q1–Q3, M01–M12, …
 *    Sector (multi) li[role=checkbox][data-value=<Hebrew>]: "כל התחומים",
 *    "פנסיה", "גמל והשתלמות", "ביטוח חיים", "ביטוח בריאות" — resets when the
 *    type changes. Year (multi, up to 3) li[role=checkbox][data-value=<year>]:
 *    renders only after a type is chosen, fixed range 2025 … 2005.
 *    button#filter-box-submit "בצע סינון" → POST /personal/reports/api/v1/
 *    get-reports {years:[2018], businessLine:["Pension","SocialBenefit"],
 *    reportType:"Yearly-Short"} → {err:null, data:[{reportType, reportPeriod,
 *    reportYear, productName, businessLine, businessLineDesc, reportId
 *    (opaque base64), fundNum, productDescription}]}; empty → "לצערנו, לא
 *    נמצאו תוצאות".
 * 3. Results: "מציג 1-N רשומות מתוך N", one li[class*=ReportItem] per report
 *    (columns סוג הדוח / שנה / מוצר / תחום / לצפייה); the row's main button
 *    aria-label "סוג הדוח: דוח שנתי מקוצר שנה: 2018 מוצר: מנורה מבטחים פנסיה
 *    מקיפה תחום פנסיה"; the PDF icon is a button.MuiIconButton-root
 *    ("לצפיה"). A study-fund row was not observed (the owner's funds joined
 *    in 2026); its sector cell is assumed to read "גמל והשתלמות".
 * 4. Download: the לצפיה click runs GET /personal/reports/api/v1/document?
 *    reportId=<id>&reportType=Yearly-Short → {err:null, data:{file:"<base64
 *    PDF>"}}, builds a blob and window.opens it in a viewer tab — the tax
 *    authority's mechanism, captured by captureNextPdf's blob-popup branch.
 */
export const menoraProvider: DocumentFetchProvider = {
  id: 'menora_mivtachim',

  async startLogin(page: Page, credentials: PortalCredentials): Promise<void> {
    const idNumber = requireCredential(credentials, 'idNumber', 'menora_mivtachim');
    const phone = normalizeMenoraPhone(requireCredential(credentials, 'phoneNumber', 'menora_mivtachim'));

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector(ID_INPUT, { state: 'visible', timeout: 90_000 });
    await debugShot(page, 'menora-01-login-page');

    await humanPause(page, 2_000, 6_000); // "reading" the form before typing
    await typeHuman(page, page.locator(ID_INPUT), idNumber);
    await page.keyboard.press('Tab');
    await humanPause(page, 500, 1_500);
    await typeHuman(page, page.locator(PHONE_INPUT), phone);
    await page.keyboard.press('Tab');
    await debugShot(page, 'menora-02-credentials-filled');

    // Sends the SMS code and swaps in the code boxes (same URL).
    await humanPause(page);
    await submitButton(page).click();
    await otpBox(page, 0).waitFor({ state: 'visible', timeout: OTP_WAIT_MS });
    await debugShot(page, 'menora-03-otp-screen');
  },

  async submitOtp(page: Page, otp: string): Promise<void> {
    await enterOtp(page, otp);
    await debugShot(page, 'menora-04-otp-filled');

    // Short pause only: the code's countdown is under a minute.
    await humanPause(page, 1_000, 3_000);
    await submitButton(page).click();

    // Success leaves the login page for the personal area. A wrong code keeps
    // the boxes up; its error markup is unverified, so rejection is inferred
    // from the boxes still being visible after the wait.
    const outcome = await Promise.race([
      page.waitForURL((url) => url.pathname.includes(PERSONAL_PATH), { timeout: OTP_WAIT_MS }).then(() => 'ok' as const),
      page.waitForTimeout(OTP_WAIT_MS).then(() => 'timeout' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome === 'timeout') {
      if (await otpBox(page, 0).isVisible().catch(() => false)) {
        await clearOtp(page);
        throw new OtpRejectedError('Menora rejected the one-time code');
      }
      throw new Error(`login did not complete: the personal area did not load within ${OTP_WAIT_MS / 1000}s`);
    }
    await debugShot(page, 'menora-05-authenticated');
  },

  async downloadDocuments(page: Page, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    const { taxYear } = opts;
    const year = String(taxYear);
    const wanted = new Set(opts.documentKeys);

    await humanPause(page); // settle on the dashboard before navigating
    await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_MS });
    await page.locator(REPORT_TYPE_NATIVE).waitFor({ state: 'attached', timeout: PAGE_LOAD_MS });
    await selectButton(page, 'reportType').waitFor({ state: 'visible', timeout: PAGE_LOAD_MS });
    await debugShot(page, 'menora-06-reports-page');

    // Report type: the short annual report. The menu closes on its own.
    await humanPause(page, 1_000, 3_000);
    await openSelect(page, 'reportType');
    await page.locator(`${LISTBOX} li[role="option"][data-value="${REPORT_TYPE_VALUE}"]`).click({ timeout: PICKER_MS });
    await expectNativeValue(page, REPORT_TYPE_NATIVE, (v) => v === REPORT_TYPE_VALUE, 'report type');

    // Sectors: pension + gemel/study fund, never "כל התחומים" (it includes insurance).
    await humanPause(page, 1_000, 3_000);
    await openSelect(page, 'businessLines');
    for (const label of SECTOR_LABELS) {
      await page.locator(`${LISTBOX} li[role="checkbox"][data-value="${label}"]`).click({ timeout: PICKER_MS });
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('Escape');
    await expectNativeValue(
      page,
      nativeInputOf('businessLines'),
      (v) => SECTOR_LABELS.every((l) => v.split(',').map((s) => s.trim()).includes(l)),
      'sectors',
    );

    // Year: the list is the site's fixed range — a year outside it must fail loudly (never another year).
    await humanPause(page, 1_000, 3_000);
    if ((await selectButton(page, 'years').count()) === 0) {
      throw new Error('the year filter did not appear after the report type was chosen');
    }
    await openSelect(page, 'years');
    // The menu opens before its rows render on the live site; an empty read here failed a real fetch.
    // A list that stays empty still falls through to the loud error below.
    await page
      .locator(`${LISTBOX} li[role="checkbox"]`)
      .first()
      .waitFor({ state: 'visible', timeout: PICKER_MS })
      .catch(() => undefined);
    const years =(await page.locator(`${LISTBOX} li[role="checkbox"]`).allTextContents()).map((t) => t.trim());
    if (!years.includes(year)) {
      await page.keyboard.press('Escape').catch(() => undefined);
      throw new Error(`the year list does not offer ${year} (offers: ${years.join(', ')})`);
    }
    await page.locator(`${LISTBOX} li[role="checkbox"][data-value="${year}"]`).click({ timeout: PICKER_MS });
    await page.keyboard.press('Escape');
    await expectNativeValue(page, nativeInputOf('years'), (v) => v === year, 'year');
    await debugShot(page, `menora-07-filters-${year}`);

    // Armed before the trigger so the round trip cannot slip past it.
    await humanPause(page, 1_000, 4_000);
    const answered = page
      .waitForResponse((res) => res.url().includes(LIST_API_MARKER), { timeout: FILTER_SETTLE_MS })
      .then((res) => res.status())
      .catch(() => null);
    await page.locator(FILTER_BUTTON).click({ timeout: PICKER_MS });
    const status = await answered;
    if (status === null) throw new Error(`the report filter never answered within ${FILTER_SETTLE_MS / 1000}s`);
    const outcome = await waitForListOutcome(page);
    await debugShot(page, `menora-08-results-${outcome}`);
    if (outcome === 'empty') {
      throw new NoDocumentsOnSiteError(`the site lists no short annual report for ${year} under פנסיה or גמל והשתלמות`);
    }

    const rows = await readRows(page);
    const selected = selectMenoraRows(rows, taxYear).filter((r) => wanted.has(r.kind));
    logger.info('menora fetch: filter answered', {
      year,
      rows: rows.map((r) => r.label),
      selected: selected.map((r) => ({ title: r.title, kind: r.kind })),
    });
    if (selected.length === 0) {
      throw new NoDocumentsOnSiteError(`the filter listed ${rows.length} row(s) for ${year} but none of a pension or study-fund sector`);
    }

    const docs: FetchedDocument[] = [];
    for (const row of selected) {
      await humanPause(page, 3_000, 8_000); // human cadence between downloads
      const filename = `${slug(row.title) || 'report'}_${year}.pdf`;
      const { buffer } = await captureNextPdf(
        page,
        () => page.locator(ROW).nth(row.index).locator(ROW_PDF_BUTTON).first().click({ timeout: PICKER_MS }),
        filename,
      );
      if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw new Error(`menora download is not a PDF (${buffer.length} bytes, starts ${JSON.stringify(buffer.subarray(0, 8).toString('latin1'))})`);
      }
      docs.push({ buffer, filename, contentType: 'application/pdf', title: row.title, kind: row.kind });
      logger.info('menora fetch: document captured', { year, title: row.title, kind: row.kind, bytes: buffer.length });
    }
    return docs;
  },
};

/** The form's single visible submit button — the login and the code screen share it. */
function submitButton(page: Page) {
  return page.locator(SUBMIT_BUTTON).filter({ visible: true }).first();
}

function otpBox(page: Page, i: number) {
  return page.locator(`input#${OTP_BOX_IDS[i]}`);
}

/**
 * Types the six digits as a person would: into the first box, letting the
 * site's auto-advance move focus box to box. If any box stayed empty (no
 * auto-advance), each box is filled on its own.
 */
async function enterOtp(page: Page, otp: string): Promise<void> {
  const digits = otp.replace(/\D/g, '');
  if (digits.length !== OTP_BOX_IDS.length) {
    throw new OtpRejectedError(`Menora expects a ${OTP_BOX_IDS.length}-digit code, got ${digits.length} digits`);
  }
  await clearOtp(page);
  await typeHuman(page, otpBox(page, 0), digits);
  const values = await readOtp(page);
  if (values.join('') === digits) return;

  logger.info('menora fetch: code boxes did not auto-advance, filling each box', { filled: values.join('') });
  for (let i = 0; i < OTP_BOX_IDS.length; i++) {
    const box = otpBox(page, i);
    await box.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(digits[i]!);
    await page.waitForTimeout(300);
  }
  const after = await readOtp(page);
  if (after.join('') !== digits) {
    throw new Error(`could not enter the code: the boxes hold "${after.join('')}"`);
  }
}

async function readOtp(page: Page): Promise<string[]> {
  const values: string[] = [];
  for (let i = 0; i < OTP_BOX_IDS.length; i++) values.push((await otpBox(page, i).inputValue().catch(() => '')).trim());
  return values;
}

/** Empties every code box so the next code can be typed into the same screen. */
async function clearOtp(page: Page): Promise<void> {
  for (let i = 0; i < OTP_BOX_IDS.length; i++) {
    const box = otpBox(page, i);
    if ((await box.inputValue().catch(() => '')) === '') continue;
    await box.click().catch(() => undefined);
    await page.keyboard.press('Control+A').catch(() => undefined);
    await page.keyboard.press('Delete').catch(() => undefined);
  }
}

/** The clickable part of a MUI Select, found by the prefix of its aria-labelledby. */
function selectButton(page: Page, labelPrefix: string) {
  return page.locator(`[role="button"][aria-labelledby^="label-${labelPrefix}"]`);
}

/** The hidden native input that holds a MUI Select's value (sits right after its [role=button]). */
function nativeInputOf(labelPrefix: string): string {
  return `[role="button"][aria-labelledby^="label-${labelPrefix}"] ~ input.MuiSelect-nativeInput`;
}

/** Opens a MUI Select and waits for its menu. */
async function openSelect(page: Page, labelPrefix: string): Promise<void> {
  await selectButton(page, labelPrefix).first().click({ timeout: PICKER_MS });
  await page.locator(LISTBOX).waitFor({ state: 'visible', timeout: PICKER_MS });
}

/** Asserts a Select's native value, so a missed click fails loudly instead of fetching the wrong thing. */
async function expectNativeValue(page: Page, selector: string, ok: (value: string) => boolean, what: string): Promise<void> {
  const deadline = Date.now() + PICKER_MS;
  for (;;) {
    const value = (await page.locator(selector).first().inputValue().catch(() => '')).trim();
    if (ok(value)) return;
    if (Date.now() > deadline) throw new Error(`the ${what} filter did not take: the select holds "${value}"`);
    await page.waitForTimeout(300);
  }
}

/** After an answered filter: a result row or the no-results text must show. */
async function waitForListOutcome(page: Page): Promise<'rows' | 'empty'> {
  const deadline = Date.now() + PICKER_MS;
  for (;;) {
    if ((await page.locator(ROW).count()) > 0) return 'rows';
    const text = await page.locator('body').innerText().catch(() => '');
    if (text.includes(NO_RESULTS_TEXT)) return 'empty';
    if (Date.now() > deadline) throw new Error('the filter answered but the page shows neither results nor the no-results text');
    await page.waitForTimeout(500);
  }
}

/** The result rows: each row's main-button aria-label, indexed among every row on the page. */
async function readRows(page: Page): Promise<MenoraRow[]> {
  const labels = await page.locator(ROW).evaluateAll((lis) =>
    lis.map((li: any) => {
      const buttons = Array.from(li.querySelectorAll('button,a') as ArrayLike<any>);
      const labelled = buttons.find((b: any) => /סוג הדוח/.test(b.getAttribute('aria-label') || ''));
      return String(labelled ? labelled.getAttribute('aria-label') : li.innerText || '');
    }),
  );
  return labels.map((label, index) => ({ index, label }));
}

/** A filename-safe slug of a Hebrew report title. */
function slug(text: string): string {
  return text.replace(/[^\w֐-׿]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}
