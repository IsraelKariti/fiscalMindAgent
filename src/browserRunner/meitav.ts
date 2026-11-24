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

/** Member ("עמית") login of the Meitav customer portal — a static URL. */
const LOGIN_URL = 'https://customers.meitav.co.il/v2/login/loginAmit';
/** "דוחות תקופתיים" — works as a direct navigation once logged in, whatever the landing page was. */
const REPORTS_URL = 'https://customers.meitav.co.il/home/myaccount/periodicreports';
/** Both login routes (/v2/login/loginAmit, /v2/login/loginCode) carry this; every landing page lacks it. */
const LOGIN_PATH = '/login';

/** Login form handles (reference project `meitav-vm-browser-login`, re-seen live 2026-11-24). */
const ID_INPUT = '#id-identity-input';
const PREFIX_SELECT = 'select[name="prefixPhone"]';
const PHONE_INPUT = 'input[name="phoneNumber"]';
const LOGIN_SUBMIT = 'button#submit';
/** Code screen handles. */
const OTP_INPUT = '#codeDigitsInput';
const OTP_SUBMIT = 'button.login-id-btn';
/** Shown with "הקוד שהזנת שגוי, יש להזין את הקוד בשנית" when the site rejects the code. */
const OTP_ERROR = 'label.errorLabel[ng-show="GeneralError"]';

/** Reports page handles (crawled live 2026-11-24). */
const YEAR_INPUT = 'input#selectYear';
const YEAR_LISTBOX = '#selectYear-listbox';
const YEAR_OPTION = '#selectYear-listbox [role="option"]';
const REPORTS_LIST = 'div.reportsList';
const ROW = 'div.reportsList li';
/** The text that separates a card's product name from its account number. */
const ACCOUNT_LABEL = 'מספר חשבון';

/** The site's mobile prefixes, exactly as the login form's dropdown lists them. */
export const MEITAV_PHONE_PREFIXES = ['050', '051', '052', '053', '054', '055', '057', '058'] as const;

const OTP_WAIT_MS = 45_000;
const FORM_VALID_MS = 15_000;
const PAGE_LOAD_MS = 60_000;
const PICKER_MS = 10_000;

export type MeitavKind = 'pension_annual' | 'study_fund_annual';

/** One report row as the page shows it. */
export interface MeitavRow {
  /** Index of the row among every ROW on the page (document order) — the click target. */
  index: number;
  /** The row title, e.g. "דוח שנתי מפורט דצמבר 2023". */
  title: string;
}

/** A row chosen for download. */
export interface SelectedMeitavRow {
  index: number;
  /** Title with whitespace collapsed — what the document is titled and labelled by. */
  title: string;
  kind: MeitavKind;
}

/** One product card: its header (product name) and its rows. */
export interface MeitavCard {
  header: string;
  rows: MeitavRow[];
}

/**
 * Splits a phone number the way the login form takes it: the three-digit
 * mobile prefix for the dropdown and the seven remaining digits for the text
 * field. Accepts the international form (972…) and stray spaces/dashes;
 * throws on a prefix the dropdown lacks (a landline, for one) or a wrong
 * length — before the site is touched (openspec `meitav-fetch`).
 */
export function splitMeitavPhone(phone: string): { prefix: string; digits: string } {
  let normalized = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (normalized.startsWith('972')) normalized = `0${normalized.slice(3)}`;
  const prefix = MEITAV_PHONE_PREFIXES.find((p) => normalized.startsWith(p));
  if (!prefix) throw new Error(`Meitav login needs an Israeli mobile number; the prefix of "${normalized.slice(0, 3)}…" is not one the site offers`);
  const digits = normalized.slice(prefix.length);
  if (!/^\d{7}$/.test(digits)) throw new Error(`Meitav login needs 7 digits after the prefix, got ${digits.length}`);
  return { prefix, digits };
}

/** The document kind of a product card from its header, or null for a product the fetch does not take. */
export function meitavKindOf(header: string): MeitavKind | null {
  if (/השתלמות/.test(header)) return 'study_fund_annual';
  if (/פנסיה|גמל/.test(header)) return 'pension_annual';
  return null;
}

/** Collapses whitespace in a row title. */
export function normalizeMeitavTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Pure selection (openspec `meitav-fetch`): the annual reports of the tax
 * year — "דוח שנתי מפורט דצמבר <year>" and "דוח שנתי מקוצר דצמבר <year>" —
 * tagged with the card's kind. Quarterly reports ("דוח רבעוני …") and a
 * title without the year are skipped; the same title within a kind is
 * downloaded once (`seen` is shared across cards by the caller).
 */
export function selectMeitavRows(
  rows: MeitavRow[],
  taxYear: number,
  kind: MeitavKind,
  seen: Set<string> = new Set(),
): SelectedMeitavRow[] {
  const year = String(taxYear);
  const selected: SelectedMeitavRow[] = [];
  for (const row of rows) {
    const title = normalizeMeitavTitle(row.title);
    if (!/דוח שנתי/.test(title) || /רבעוני/.test(title) || !title.includes(year)) continue;
    const key = `${kind}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ index: row.index, title, kind });
  }
  return selected;
}

/**
 * Meitav (מיטב) — customer portal, gemel/pension/study-fund annual reports.
 *
 * Login (reference project `meitav-vm-browser-login`, re-seen live
 * 2026-11-24): /v2/login/loginAmit is an AngularJS form (`form[name=loginAmit]`,
 * invisible reCAPTCHA badge that never challenged): #id-identity-input (the
 * 9-digit id), select[name=prefixPhone] (050 051 052 053 054 055 057 058 —
 * AngularJS needs a dispatched `change` after selectOption), input
 * [name=phoneNumber] (7 digits), button#submit "אישור" (disabled until the
 * form validates; typing char by char + Tab is what makes it validate). Submit
 * sends the SMS and routes to /v2/login/loginCode: one field #codeDigitsInput
 * (6 digits, password-type with a "הצג סיסמא" toggle), button.login-id-btn
 * "אישור" (disabled until 6 digits). Wrong code: label.errorLabel
 * [ng-show=GeneralError] "הקוד שהזנת שגוי, יש להזין את הקוד בשנית", the code
 * screen stays up. Resend link a.green-link-background — never pressed here:
 * the site locks after "ניסיונות חריגים". Success leaves /login; the landing
 * is account-dependent (/home/MyAccount.aspx = the gemel lobby with a promo
 * popup, /tradelobby for a Trade-only account), so the next step navigates
 * directly instead of clicking the lobby.
 *
 * Reports (crawled live 2026-11-24 in the owner's account):
 * /home/myaccount/periodicreports ("דוחות תקופתיים", React/MUI from
 * /staticgemel/). On load one request GET /v2/api/PeriodicReports/
 * GetPeriodicReports?amitid=…&fromReports=… returns the whole list for every
 * year ([{AmitID, AmitName, periodicReportsObj: [{New_year, New_quarter,
 * KupaName, account, Statementid, ReportName, ReportEngUrl, SugDoch}]}]); the
 * year picker filters in the page. input#selectYear is an MUI Autocomplete
 * (default = the latest year; options #selectYear-listbox [role=option] —
 * only the years the account has reports for: 2026, 2023 … 2018 observed);
 * input#selectIdentity is a disabled identity picker. One card per product
 * (header = KupaName, "פנסיה" observed, then "מספר חשבון 18-…"), rows
 * div.reportsList > ul > li (img icon + span title, React onClick on the li).
 * Titles / SugDoch: 0 "דוח רבעוני <month> <year>" (quarters 1–3), 1 "דוח שנתי
 * מקוצר דצמבר <year>", 2 "דוח שנתי מפורט דצמבר <year>". A study-fund card was
 * not observed (the owner holds none); its header is assumed to contain
 * "השתלמות".
 *
 * Download: the row click calls window.open('/v2/api/periodicReports/
 * DownloadReport?statementid=<8 digits>&ReportEngUrl=December 2.pdf&
 * agent_amitid=0'); the popup receives the PDF as an attachment, the browser
 * saves it and the popup closes itself — captured by `captureNextPdf`'s popup
 * download mechanism. The same GET answers 401 once the member session has
 * expired, so the downloads follow the year selection without delay.
 */
export const meitavProvider: DocumentFetchProvider = {
  id: 'meitav',

  async startLogin(page: Page, credentials: PortalCredentials): Promise<void> {
    const idNumber = requireCredential(credentials, 'idNumber', 'meitav');
    const phone = requireCredential(credentials, 'phoneNumber', 'meitav');
    // A number the form cannot take fails here, before any browser work.
    const { prefix, digits } = splitMeitavPhone(phone);

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector(ID_INPUT, { state: 'visible', timeout: 90_000 });
    await debugShot(page, 'meitav-01-login-page');

    await humanPause(page, 2_000, 6_000); // "reading" the form before typing
    await typeHuman(page, page.locator(ID_INPUT), idNumber);
    await page.keyboard.press('Tab'); // AngularJS ng-blur validation

    await humanPause(page, 500, 1_500);
    const prefixSelect = page.locator(PREFIX_SELECT);
    await prefixSelect.selectOption(prefix);
    // AngularJS' ng-model on a <select> does not see Playwright's selectOption alone.
    await prefixSelect.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));

    await humanPause(page, 500, 1_500);
    await typeHuman(page, page.locator(PHONE_INPUT), digits);
    await page.keyboard.press('Tab');
    await debugShot(page, 'meitav-02-credentials-filled');

    // The button enables only once every field validated — the proof the typing landed.
    try {
      await page.waitForSelector(`${LOGIN_SUBMIT}:not([disabled])`, { timeout: FORM_VALID_MS });
    } catch {
      throw new Error(`the login form did not validate within ${FORM_VALID_MS / 1000}s (submit stayed disabled)`);
    }

    // Sends the SMS code and routes to the code screen.
    await humanPause(page);
    await page.locator(LOGIN_SUBMIT).click();
    await page.waitForSelector(OTP_INPUT, { state: 'visible', timeout: OTP_WAIT_MS });
    await debugShot(page, 'meitav-03-otp-screen');
  },

  async submitOtp(page: Page, otp: string): Promise<void> {
    const digits = otp.replace(/\D/g, '');
    if (digits.length !== 6) throw new OtpRejectedError(`Meitav expects a 6-digit code, got ${digits.length} digits`);

    await clearOtp(page);
    await typeHuman(page, page.locator(OTP_INPUT), digits);
    await page.keyboard.press('Tab');
    await debugShot(page, 'meitav-04-otp-filled');
    try {
      await page.waitForSelector(`${OTP_SUBMIT}:not([disabled])`, { timeout: PICKER_MS });
    } catch {
      await clearOtp(page);
      throw new OtpRejectedError('Meitav did not accept the code as six digits');
    }

    // Short pause only: the code is valid for minutes.
    await humanPause(page, 1_000, 3_000);
    await page.locator(OTP_SUBMIT).click();

    // Success leaves the login routes; a wrong code shows the site's own error
    // label with the code screen still up.
    const outcome = await Promise.race([
      page
        .waitForURL((url) => !url.pathname.includes(LOGIN_PATH), { timeout: OTP_WAIT_MS })
        .then(() => 'ok' as const),
      page
        .locator(OTP_ERROR)
        .waitFor({ state: 'visible', timeout: OTP_WAIT_MS })
        .then(() => 'rejected' as const),
      page.waitForTimeout(OTP_WAIT_MS).then(() => 'timeout' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome === 'rejected') {
      await debugShot(page, 'meitav-04b-otp-rejected');
      await clearOtp(page);
      throw new OtpRejectedError('Meitav rejected the one-time code');
    }
    if (outcome === 'timeout') {
      // The error markup may change; a code screen still up is still a rejection.
      if (await page.locator(OTP_INPUT).isVisible().catch(() => false)) {
        await clearOtp(page);
        throw new OtpRejectedError('Meitav kept the code screen up after the code was submitted');
      }
      throw new Error(`login did not complete: the personal area did not load within ${OTP_WAIT_MS / 1000}s`);
    }
    await debugShot(page, 'meitav-05-authenticated');
  },

  async downloadDocuments(page: Page, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    const { taxYear } = opts;
    const year = String(taxYear);
    const wanted = new Set(opts.documentKeys);

    await humanPause(page); // settle on the landing page before navigating
    await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_MS });
    await page.locator(YEAR_INPUT).waitFor({ state: 'visible', timeout: PAGE_LOAD_MS });
    await waitForListLoaded(page);
    await debugShot(page, 'meitav-06-reports-page');

    // The picker lists only the years with reports: a missing year is "nothing for that year".
    const years = await openYearPicker(page);
    if (!years.includes(year)) {
      await page.keyboard.press('Escape').catch(() => undefined);
      logger.info('meitav fetch: tax year not offered by the year picker', { year, years });
      throw new NoDocumentsOnSiteError(`the account has no reports for ${year} (the year picker offers: ${years.join(', ')})`);
    }
    await humanPause(page, 500, 2_000);
    await page.locator(YEAR_OPTION).filter({ hasText: new RegExp(`^${year}$`) }).first().click({ timeout: PICKER_MS });
    await page.waitForFunction(
      ({ selector, value }) => {
        const doc = (globalThis as any).document;
        return doc.querySelector(selector)?.value === value;
      },
      { selector: YEAR_INPUT, value: year },
      { timeout: PICKER_MS },
    );
    await humanPause(page, 1_000, 3_000);
    await debugShot(page, `meitav-07-year-${year}`);

    const cards = await readCards(page);
    logger.info('meitav fetch: product cards', {
      year,
      cards: cards.map((c) => ({ header: c.header, rows: c.rows.map((r) => normalizeMeitavTitle(r.title)) })),
    });

    const docs: FetchedDocument[] = [];
    const seen = new Set<string>();
    for (const card of cards) {
      const kind = meitavKindOf(card.header);
      if (!kind) {
        logger.info('meitav fetch: card of a product the fetch does not take, skipped', { header: card.header });
        continue;
      }
      // The worker always sends every key (takesAllDocuments); honouring the
      // list here keeps the runner correct should that ever change.
      if (!wanted.has(kind)) continue;
      const selected = selectMeitavRows(card.rows, taxYear, kind, seen);
      for (const row of selected) {
        await humanPause(page, 3_000, 8_000); // human cadence between downloads
        const { buffer } = await captureNextPdf(
          page,
          () => page.locator(ROW).nth(row.index).click({ timeout: PICKER_MS }),
          `${slug(row.title) || 'report'}_${year}.pdf`,
        );
        if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
          throw new Error(`meitav download is not a PDF (${buffer.length} bytes, starts ${JSON.stringify(buffer.subarray(0, 8).toString('latin1'))})`);
        }
        docs.push({
          buffer,
          // The site's own name ("December 2.pdf") says nothing; name the file by its title.
          filename: `${slug(row.title) || 'report'}_${year}.pdf`,
          contentType: 'application/pdf',
          title: row.title,
          kind,
        });
        logger.info('meitav fetch: document captured', { year, title: row.title, kind, bytes: buffer.length });
      }
    }

    if (docs.length === 0) {
      throw new NoDocumentsOnSiteError(`the account lists no annual report for ${year} under any pension, gemel or study-fund card`);
    }
    return docs;
  },
};

/** Empties the single code field so the next code can be typed into the same screen. */
async function clearOtp(page: Page): Promise<void> {
  const box = page.locator(OTP_INPUT);
  if ((await box.inputValue().catch(() => '')) === '') return;
  await box.click().catch(() => undefined);
  await page.keyboard.press('Control+A').catch(() => undefined);
  await page.keyboard.press('Delete').catch(() => undefined);
}

/**
 * The list request answers after the page shell renders; "loaded" = a product
 * card exists, or the picker holds its default year (an account with no
 * reports at all shows no card, and then the year walk below reports it).
 */
async function waitForListLoaded(page: Page): Promise<void> {
  await page
    .waitForFunction(
      ({ list, year }) => {
        const doc = (globalThis as any).document;
        return doc.querySelector(list) !== null || (doc.querySelector(year)?.value ?? '') !== '';
      },
      { list: REPORTS_LIST, year: YEAR_INPUT },
      { timeout: PAGE_LOAD_MS },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1_000);
}

/** Opens the MUI year picker (focus + ArrowDown, else its "Open" arrow) and returns the option texts. */
async function openYearPicker(page: Page): Promise<string[]> {
  const input = page.locator(YEAR_INPUT);
  await input.click();
  await page.keyboard.press('ArrowDown');
  if (!(await page.locator(YEAR_LISTBOX).isVisible().catch(() => false))) {
    // The popup indicator sits right after the input inside the same MUI root.
    await page.locator(`${YEAR_INPUT} ~ * button[aria-label="Open"]`).first().click({ timeout: PICKER_MS });
  }
  await page.locator(YEAR_LISTBOX).waitFor({ state: 'visible', timeout: PICKER_MS });
  return (await page.locator(YEAR_OPTION).allTextContents()).map((t) => t.trim());
}

/**
 * The product cards in document order: each `div.reportsList` with the
 * header of the card it sits in (the text before "מספר חשבון" of the nearest
 * ancestor that holds that label) and its rows, indexed among every row on
 * the page so the click target is unambiguous.
 */
async function readCards(page: Page): Promise<MeitavCard[]> {
  // Arrow functions only inside evaluate (tsx keepNames breaks named inner functions there).
  return page.evaluate(
    ({ list, row, label }) => {
      const doc = (globalThis as any).document;
      const cards: { header: string; rows: { index: number; title: string }[] }[] = [];
      const allRows: any[] = Array.from(doc.querySelectorAll(row) as ArrayLike<any>);
      for (const el of Array.from(doc.querySelectorAll(list) as ArrayLike<any>)) {
        let node: any = el;
        let header = '';
        for (let depth = 0; node && depth < 8; depth++) {
          const text = String(node.innerText || '').replace(/\s+/g, ' ').trim();
          if (text.includes(label)) {
            header = text.split(label)[0]!.trim();
            break;
          }
          node = node.parentElement;
        }
        const rows = Array.from(el.querySelectorAll('li') as ArrayLike<any>).map((li: any) => ({
          index: allRows.indexOf(li),
          title: String(li.innerText || '').trim(),
        }));
        cards.push({ header, rows });
      }
      return cards;
    },
    { list: REPORTS_LIST, row: ROW, label: ACCOUNT_LABEL },
  );
}

/** A filename-safe slug of a Hebrew report title. */
function slug(text: string): string {
  return text.replace(/[^\w֐-׿]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}
