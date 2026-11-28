import type { Download, Page, Request } from 'playwright';
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

/** "מגדל שלי" login — a static URL (what the public site's מגדל שלי button opens), no one-time state. */
const LOGIN_URL = 'https://my.migdal.co.il/mymigdal/process/login';
/** "הדוחות והאישורים שלי"; works as a direct navigation once logged in. */
const REPORTS_URL = 'https://my.migdal.co.il/mymigdal/info/approvals';
/** Every authenticated page lives under this path; the login lands on /mymigdal/lobby/main/. */
const LOBBY_PATH = '/mymigdal/lobby/';

/** Login form handles (verified live 2026-11-24). */
const ID_INPUT = 'input#username';
const SMS_RADIO = 'input#otpToCell';
const SMS_RADIO_LABEL = 'label[for="otpToCell"]';
/** The login and the code screen share one form and one submit button ("המשך"). */
const SUBMIT_BUTTON = 'form button[type="submit"]';
/** The six one-digit code boxes, in order. */
const OTP_BOX_NAMES = ['otp', 'otp2', 'otp3', 'otp4', 'otp5', 'otp6'] as const;

/** Reports page handles — plain <select>s, picked by visible label. */
const TYPE_SELECT = 'select#selectApprovalType';
const PRODUCT_SELECT = 'select#selectApprovalProducts';
const YEAR_SELECT = 'select#selectYear';
const SEARCH_BUTTON = 'button#btnSearch';
/** Each result row holds two of these: the title link (with text) and the PDF icon (empty). */
const ROW_LINK = 'a[aria-label="להורדת המסמך"]';
const EMPTY_TEXT = 'לא מצאנו נתונים לתצוגה';
/** The search's server round trip (POST …/UserDocuments//api/customerPeriodReports). */
const LIST_API_MARKER = 'customerPeriodReports';

const OTP_WAIT_MS = 45_000;
const FILTER_SETTLE_MS = 30_000;
const OPTIONS_LOAD_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export type MigdalKind = 'pension_annual' | 'study_fund_annual';

/** One filter round: report type × product, and the document kind its rows are tagged with. */
export interface MigdalRound {
  typeLabel: string;
  productLabel: string;
  kind: MigdalKind;
}

/**
 * The owner's rule (openspec `migdal-fetch`): both report types for both
 * products, in this order. Health reports (product "בריאות") are never asked
 * for. Kind comes from the round, never from the row title — study-fund titles
 * were not observed live.
 */
export const MIGDAL_ROUNDS: readonly MigdalRound[] = [
  { typeLabel: 'דוח שנתי', productLabel: 'פנסיה', kind: 'pension_annual' },
  { typeLabel: 'דוח שנתי', productLabel: 'השתלמות', kind: 'study_fund_annual' },
  { typeLabel: 'דוח שנתי מקוצר', productLabel: 'פנסיה', kind: 'pension_annual' },
  { typeLabel: 'דוח שנתי מקוצר', productLabel: 'השתלמות', kind: 'study_fund_annual' },
];

/** One result row as the page shows it. */
export interface MigdalRow {
  /** Index of the title link among every ROW_LINK on the page — the click target. */
  index: number;
  /** The row title, e.g. "דוח שנתי לעמית- מקפת  אישית - לשנת 2016" (raw, whitespace as the site prints it). */
  title: string;
}

/** A row chosen for download. */
export interface SelectedMigdalRow {
  index: number;
  /** Title with whitespace collapsed — what the document is titled and labelled by. */
  title: string;
  kind: MigdalKind;
}

/** Collapses the site's stray double spaces ("מקפת  אישית") into one. */
export function normalizeMigdalTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The year dropdown's "every year" option (annual report types only). */
export const ALL_YEARS_LABEL = 'כל השנים';
/** The tax-certificate report type, and the prefix of every row title it lists. */
export const TAX_CERTIFICATE_LABEL = 'אישור מס';

/**
 * How a search was narrowed to the tax year: 'year' = the year was selected in
 * the dropdown; 'all_years' = the dropdown lacks the year, "כל השנים" was
 * selected and only the row titles tell the year.
 */
export type MigdalYearMode = 'year' | 'all_years';

/**
 * The year option to select (openspec `migdal-fetch`): the tax year when the
 * dropdown offers it, else "כל השנים" (the list then also shows years the
 * dropdown does not offer — seen live 2026-11-28: 2016-2018 under a 2019-2026
 * dropdown), else null (the round ends with nothing). Pure.
 */
export function chooseYearOption(options: string[], taxYear: number): { label: string; mode: MigdalYearMode } | null {
  const year = String(taxYear);
  if (options.includes(year)) return { label: year, mode: 'year' };
  if (options.includes(ALL_YEARS_LABEL)) return { label: ALL_YEARS_LABEL, mode: 'all_years' };
  return null;
}

/**
 * Whether a row title belongs to the tax year (openspec `migdal-fetch`): the
 * title holds the year as a four-digit number, anywhere in it. The wording
 * around the year is not checked (the owner's rule: a title worded differently
 * must not be dropped); the four digits inside a longer number ("120165") do
 * not count. Under "כל השנים" this is the only thing that tells the year. Pure.
 */
export function titleCarriesYear(title: string, taxYear: number): boolean {
  const year = String(taxYear);
  const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
  for (let at = title.indexOf(year); at >= 0; at = title.indexOf(year, at + 1)) {
    if (!isDigit(title.charAt(at - 1)) && !isDigit(title.charAt(at + year.length))) return true;
  }
  return false;
}

/**
 * Sorts one product option of the tax-certificate type into a document kind
 * (openspec `migdal-fetch`). That list holds the account's own product names
 * (seen live: "מקפת אישית", "מגדל השתלמות", "בריאות"), not the fixed labels of
 * the annual types. Study fund first, so a name holding both words is a study
 * fund; null = never searched (כל המוצרים, health, an unknown product). Pure.
 */
export function classifyTaxCertificateProduct(label: string): MigdalKind | null {
  if (/השתלמות/.test(label)) return 'study_fund_annual';
  if (/מקפת|פנסיה|גמל/.test(label)) return 'pension_annual';
  return null;
}

/**
 * Pure selection for one search (openspec `migdal-fetch`): every row whose
 * title belongs to the tax year (see titleCarriesYear) is taken, tagged with
 * the search's kind; any other title is skipped (never another year's
 * document); the same title within a kind is downloaded once across searches
 * (`seen` is shared by the caller; the full and the short report have
 * different titles, so both stay).
 */
export function selectMigdalRows(
  rows: MigdalRow[],
  taxYear: number,
  kind: MigdalKind,
  seen: Set<string> = new Set(),
): SelectedMigdalRow[] {
  const selected: SelectedMigdalRow[] = [];
  for (const row of rows) {
    const title = normalizeMigdalTitle(row.title);
    if (!title || !titleCarriesYear(title, taxYear)) continue;
    const key = `${kind}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ index: row.index, title, kind });
  }
  return selected;
}

/**
 * Migdal (מגדל) — "מגדל שלי" personal area, pension and study-fund annual
 * reports (full + short). Flow mapped LIVE 2026-11-24 in the owner's own
 * account (the owner typed the id and the code; everything below is what the
 * pages showed):
 *
 * 1. Login: /mymigdal/process/login (Angular SPA, no iframe). form
 *    .mymigdal-login-form with input#username (type=number, the 9-digit id),
 *    radios #otpToCell ("נייד", checked by default) / #otpToEmail, one submit
 *    button "המשך". No phone is typed — the site sends the SMS to the mobile
 *    number it holds for the id. Submitting swaps the form in place (same URL)
 *    for the code screen: six boxes input[name=otp], otp2 … otp6 (one digit
 *    each, inputmode numeric), links "שלח שוב" / "לקבלת קוד האימות לכתובת
 *    המייל", the same submit button. Success lands on /mymigdal/lobby/main/.
 *    The wrong-code markup was NOT observed — rejection is inferred from the
 *    boxes still being up after the wait (same inference as Phoenix).
 * 2. Reports: /mymigdal/info/approvals. select#selectApprovalType (39 "דוח
 *    שנתי", 40 "דוח שנתי מקוצר", …), select#selectApprovalProducts (loaded per
 *    type from the server; per account — seen: כל המוצרים / פנסיה / בריאות /
 *    השתלמות), select#selectYear ("כל השנים" then 2026 … 2019 — the site's
 *    range, not the account's; a "כל השנים" search also lists older years,
 *    seen 2016-2018), button#btnSearch "הצג אישור" → POST
 *    customerPeriodReports. Results: "נמצאו N תוצאות" for two rows or more,
 *    "תהליך הפקת האישור הסתיים בהצלחה" for one; per row two
 *    a[aria-label="להורדת המסמך"] (title link + PDF icon); empty answer "לא
 *    מצאנו נתונים לתצוגה". Year rule: the tax year when offered, else "כל
 *    השנים" with rows kept by the year in their title.
 *    Tax certificate (seen live 2026-11-28): type 32 "אישור מס" lists the
 *    account's product names (כל המוצרים / בריאות / מגדל השתלמות / מקפת
 *    אישית) and years 2025 … 2019 with no "כל השנים"; titles read "אישור מס
 *    לשנת 2025 עבור מקפת אישית". It runs after the four annual rounds, one
 *    search per pension / study-fund product, only when the year is offered.
 * 3. Download: clicking the title link POSTs imagedocumentinfo + imagedocument
 *    and saves a normal browser download "<title>.pdf" — captured via the
 *    download event. No popup, no new tab.
 */
export const migdalProvider: DocumentFetchProvider = {
  id: 'migdal',

  async startLogin(page: Page, credentials: PortalCredentials): Promise<void> {
    const idNumber = requireCredential(credentials, 'idNumber', 'migdal');

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector(ID_INPUT, { state: 'visible', timeout: 90_000 });
    await debugShot(page, 'migdal-01-login-page');

    await humanPause(page, 2_000, 6_000); // "reading" the form before typing
    await typeHuman(page, page.locator(ID_INPUT), idNumber);
    await page.keyboard.press('Tab');

    // The SMS channel is the default; make sure it stayed that way.
    if (!(await page.locator(SMS_RADIO).isChecked().catch(() => false))) {
      await page.locator(SMS_RADIO_LABEL).first().click();
    }
    await debugShot(page, 'migdal-02-id-filled');

    // Sends the SMS code and swaps in the code boxes (same URL).
    await humanPause(page);
    await submitButton(page).click();
    await otpBox(page, 0).waitFor({ state: 'visible', timeout: OTP_WAIT_MS });
    await debugShot(page, 'migdal-03-otp-screen');
  },

  async submitOtp(page: Page, otp: string): Promise<void> {
    const siteSubmit = watchSiteSubmit(page);
    try {
      await enterOtp(page, otp);
      await debugShot(page, 'migdal-04-otp-filled');

      // Short pause only: the code is valid for about three minutes.
      await humanPause(page, 1_000, 3_000);

      // The site sends the code by itself on the sixth digit and the button
      // leaves the page (seen in production 2026-11-28: the login succeeded
      // while this step waited 30s for the button). Press it only when the
      // site did not submit and the button is still there.
      const press = shouldPressSubmit({
        siteSubmitted: siteSubmit.seen(),
        onCodeScreen: await onCodeScreen(page),
        buttonVisible: await submitButton(page).isVisible().catch(() => false),
      });
      logger.info('migdal fetch: code entered', { siteSubmitted: siteSubmit.seen(), pressSubmit: press });
      if (press) {
        await submitButton(page)
          .click({ timeout: 5_000 })
          .catch((err: unknown) => logger.info('migdal fetch: submit button left before the press', { error: String(err).slice(0, 200) }));
      }
    } finally {
      siteSubmit.stop();
    }

    // Success leaves the login route for the lobby. A wrong code keeps the
    // boxes up; its error markup is unverified, so rejection is inferred from
    // the boxes still being visible after the wait.
    const outcome = await Promise.race([
      page.waitForURL((url) => url.pathname.includes(LOBBY_PATH), { timeout: OTP_WAIT_MS }).then(() => 'ok' as const),
      page.waitForTimeout(OTP_WAIT_MS).then(() => 'timeout' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome === 'timeout') {
      if (await otpBox(page, 0).isVisible().catch(() => false)) {
        await clearOtp(page);
        throw new OtpRejectedError('Migdal rejected the one-time code');
      }
      throw new Error(`login did not complete: the personal area did not load within ${OTP_WAIT_MS / 1000}s`);
    }
    await debugShot(page, 'migdal-05-authenticated');
  },

  async downloadDocuments(page: Page, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    const { taxYear } = opts;
    const wanted = new Set(opts.documentKeys);

    await humanPause(page); // settle on the lobby before navigating
    await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator(TYPE_SELECT).waitFor({ state: 'visible', timeout: 60_000 });
    await debugShot(page, 'migdal-06-reports-page');

    const docs: FetchedDocument[] = [];
    const seen = new Set<string>();
    let answeredRounds = 0;
    for (const [i, round] of MIGDAL_ROUNDS.entries()) {
      // The worker always sends every key (takesAllDocuments); honouring the
      // list here keeps the runner correct should that ever change.
      if (!wanted.has(round.kind)) continue;
      const outcome = await runRound(page, round, taxYear, seen, docs, i + 1);
      if (outcome !== 'no_product') answeredRounds++;
    }
    // The tax certificate, after the annual rounds (openspec `migdal-fetch`).
    if ((await runTaxCertificate(page, taxYear, wanted, seen, docs)) !== 'no_product') answeredRounds++;

    if (docs.length === 0) {
      if (answeredRounds === 0) {
        throw new Error('no round could run: no report type offered a pension or study-fund product');
      }
      throw new NoDocumentsOnSiteError(
        `the site lists no annual report or tax certificate for ${taxYear} under pension or study fund (every search answered empty)`,
      );
    }
    return docs;
  },
};

/** The form's single submit button ("המשך") — the login and the code screen share it. */
function submitButton(page: Page) {
  return page.locator(SUBMIT_BUTTON).filter({ visible: true }).first();
}

/**
 * Whether the code step presses "המשך" after typing the code. Never when the
 * site already sent the code by itself (a second press would spend another
 * attempt on the same code), never once the code screen is gone. Pure.
 */
export function shouldPressSubmit(state: { siteSubmitted: boolean; onCodeScreen: boolean; buttonVisible: boolean }): boolean {
  return !state.siteSubmitted && state.onCodeScreen && state.buttonVisible;
}

/** True while the login route still shows the code boxes. */
async function onCodeScreen(page: Page): Promise<boolean> {
  if (new URL(page.url()).pathname.includes(LOBBY_PATH)) return false;
  return otpBox(page, 0)
    .isVisible()
    .catch(() => false);
}

/** Whether a request is the site's own form post (analytics posts go to other hosts). Pure. */
export function isMigdalFormPost(method: string, url: string): boolean {
  if (method !== 'POST') return false;
  try {
    const host = new URL(url).hostname;
    return host === 'migdal.co.il' || host.endsWith('.migdal.co.il');
  } catch {
    return false;
  }
}

/** Records whether the site posted to its own host from now on (its automatic code submit). */
function watchSiteSubmit(page: Page): { seen: () => boolean; stop: () => void } {
  let seen = false;
  const onRequest = (request: Request): void => {
    if (isMigdalFormPost(request.method(), request.url())) seen = true;
  };
  page.on('request', onRequest);
  return { seen: () => seen, stop: () => page.off('request', onRequest) };
}

function otpBox(page: Page, i: number) {
  return page.locator(`input[name="${OTP_BOX_NAMES[i]}"]`);
}

/**
 * Types the six digits as a person would: into the first box, letting the
 * site's auto-advance move focus box to box. If any box stayed empty (no
 * auto-advance), each box is filled on its own.
 */
async function enterOtp(page: Page, otp: string): Promise<void> {
  const digits = otp.replace(/\D/g, '');
  if (digits.length !== OTP_BOX_NAMES.length) {
    throw new OtpRejectedError(`Migdal expects a ${OTP_BOX_NAMES.length}-digit code, got ${digits.length} digits`);
  }
  await clearOtp(page);
  await typeHuman(page, otpBox(page, 0), digits);
  const values = await readOtp(page);
  if (values.join('') === digits) return;
  // The site submits on the sixth digit; once the code screen is gone the boxes cannot be read or refilled.
  if (!(await onCodeScreen(page))) return;

  logger.info('migdal fetch: code boxes did not auto-advance, filling each box', { filled: values.join('') });
  for (let i = 0; i < OTP_BOX_NAMES.length; i++) {
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
  for (let i = 0; i < OTP_BOX_NAMES.length; i++) values.push((await otpBox(page, i).inputValue().catch(() => '')).trim());
  return values;
}

/** Empties every code box so the next code can be typed into the same screen. */
async function clearOtp(page: Page): Promise<void> {
  for (let i = 0; i < OTP_BOX_NAMES.length; i++) {
    const box = otpBox(page, i);
    if ((await box.inputValue().catch(() => '')) === '') continue;
    await box.click().catch(() => undefined);
    await page.keyboard.press('Control+A').catch(() => undefined);
    await page.keyboard.press('Delete').catch(() => undefined);
  }
}

/** Visible option labels of a <select>, trimmed. */
async function optionLabels(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(`${selector} option`).allTextContents()).map((t) => t.trim());
}

/**
 * One annual-report filter round (openspec `migdal-fetch`): type and product
 * by label, the year by chooseYearOption, search, then download the rows of
 * the tax year. 'no_product' = the site offers no such product for this report
 * type (the client lacks it); 'no_year' = the dropdown offers neither the year
 * nor "כל השנים"; 'empty' = the search answered with the no-data text; 'rows' =
 * documents were listed (those of the year were downloaded into `docs`).
 */
async function runRound(
  page: Page,
  round: MigdalRound,
  taxYear: number,
  seen: Set<string>,
  docs: FetchedDocument[],
  roundNumber: number,
): Promise<'rows' | 'empty' | 'no_product' | 'no_year'> {
  const tag = `${round.typeLabel} / ${round.productLabel}`;
  await humanPause(page, 1_000, 4_000);
  // The type list is global — a missing label is a site change, so this throws.
  await page.selectOption(TYPE_SELECT, { label: round.typeLabel });

  // The product list reloads per type from the server; wait for it to hold
  // more than its placeholder, then look for the round's product.
  const products = await waitForProductOptions(page);
  if (!products.includes(round.productLabel)) {
    logger.info('migdal fetch: product not offered for this report type', { round: tag, products });
    return 'no_product';
  }
  await humanPause(page, 1_000, 3_000);
  await page.selectOption(PRODUCT_SELECT, { label: round.productLabel });

  // The year dropdown may only render after a search has run in this session —
  // prime it once, with the product already narrowed.
  if ((await page.locator(YEAR_SELECT).count()) === 0) {
    logger.info('migdal fetch: priming search so the year dropdown renders', { round: tag });
    await humanPause(page, 1_000, 3_000);
    const primed = watchListRoundTrip(page);
    await page.locator(SEARCH_BUTTON).click();
    await primed;
    await page.locator(YEAR_SELECT).waitFor({ state: 'visible', timeout: OPTIONS_LOAD_MS });
  }
  // The tax year when offered, else "כל השנים" — never another year.
  const years = await optionLabels(page, YEAR_SELECT);
  const choice = chooseYearOption(years, taxYear);
  if (!choice) {
    logger.info('migdal fetch: the year dropdown offers neither the year nor all years', { round: tag, year: taxYear, years });
    return 'no_year';
  }
  await page.selectOption(YEAR_SELECT, { label: choice.label });

  return searchAndCapture(page, { tag, kind: round.kind, taxYear, mode: choice.mode, shot: `migdal-07-round-${roundNumber}`, seen, docs });
}

/**
 * The tax certificate (openspec `migdal-fetch`): type "אישור מס", then one
 * search per product the account lists that sorts into a wanted kind. Its year
 * dropdown has no "כל השנים", so the step runs only when the tax year is
 * offered. 'no_product' = no pension or study-fund product is listed;
 * 'no_year' = the year is not offered (nothing searched, never another year);
 * 'searched' = at least one search ran (its rows, if any, are in `docs`).
 */
async function runTaxCertificate(
  page: Page,
  taxYear: number,
  wanted: Set<string>,
  seen: Set<string>,
  docs: FetchedDocument[],
): Promise<'searched' | 'no_product' | 'no_year'> {
  const year = String(taxYear);
  await humanPause(page, 1_000, 4_000);
  // The type list is global — a missing label is a site change, so this throws.
  await page.selectOption(TYPE_SELECT, { label: TAX_CERTIFICATE_LABEL });

  const products = await waitForProductOptions(page);
  const sorted: { label: string; kind: MigdalKind }[] = [];
  for (const label of products) {
    const kind = classifyTaxCertificateProduct(label);
    if (kind && wanted.has(kind)) sorted.push({ label, kind });
  }
  logger.info('migdal fetch: tax certificate products', {
    products,
    searched: sorted.map((p) => `${p.label} → ${p.kind}`),
    skipped: products.filter((label) => !sorted.some((p) => p.label === label)),
  });
  if (sorted.length === 0) return 'no_product';

  // This type's year dropdown renders with the type (no priming search).
  const rendered = await page
    .locator(YEAR_SELECT)
    .waitFor({ state: 'visible', timeout: OPTIONS_LOAD_MS })
    .then(() => true)
    .catch(() => false);
  const years = rendered ? await optionLabels(page, YEAR_SELECT) : [];
  if (!years.includes(year)) {
    logger.info('migdal fetch: tax certificate skipped, the year is not offered for this type', { year, years });
    return 'no_year';
  }

  for (const [i, product] of sorted.entries()) {
    await humanPause(page, 1_000, 3_000);
    await page.selectOption(PRODUCT_SELECT, { label: product.label });
    await page.selectOption(YEAR_SELECT, { label: year });
    await searchAndCapture(page, {
      tag: `${TAX_CERTIFICATE_LABEL} / ${product.label}`,
      kind: product.kind,
      taxYear,
      mode: 'year',
      shot: `migdal-08-tax-${i + 1}`,
      seen,
      docs,
    });
  }
  return 'searched';
}

/**
 * Presses "הצג אישור" on the filters already selected and downloads every
 * listed row of the tax year into `docs`. 'empty' = the no-data text.
 */
async function searchAndCapture(
  page: Page,
  opts: { tag: string; kind: MigdalKind; taxYear: number; mode: MigdalYearMode; shot: string; seen: Set<string>; docs: FetchedDocument[] },
): Promise<'rows' | 'empty'> {
  const { tag, kind, taxYear, mode, docs } = opts;
  const year = String(taxYear);
  // Armed before the trigger so the round trip cannot slip past it.
  await humanPause(page, 1_000, 4_000);
  const answered = watchListRoundTrip(page);
  await page.locator(SEARCH_BUTTON).click();
  const status = await answered;
  if (status === null) throw new Error(`the search for ${tag} ${year} never answered within ${FILTER_SETTLE_MS / 1000}s`);
  const outcome = await waitForListOutcome(page);
  await debugShot(page, `${opts.shot}-${outcome}`);
  if (outcome === 'empty') {
    logger.info('migdal fetch: no documents for this round', { round: tag, year, mode });
    return 'empty';
  }

  const rows = await readRows(page);
  const selected = selectMigdalRows(rows, taxYear, kind, opts.seen);
  logger.info('migdal fetch: round answered', {
    round: tag,
    year,
    mode,
    rows: rows.length,
    selected: selected.length,
    skipped: rows.map((r) => normalizeMigdalTitle(r.title)).filter((title) => !titleCarriesYear(title, taxYear)),
  });
  for (const row of selected) {
    await humanPause(page, 3_000, 8_000); // human cadence between downloads
    const { buffer, filename } = await captureDownload(page, () => page.locator(ROW_LINK).nth(row.index).click({ timeout: 10_000 }));
    docs.push({
      buffer,
      filename: filename || `${slug(row.title) || 'report'}_${year}.pdf`,
      contentType: 'application/pdf',
      title: row.title,
      kind: row.kind,
    });
    logger.info('migdal fetch: document captured', { round: tag, year, title: row.title, kind: row.kind, bytes: buffer.length });
  }
  return 'rows';
}

/** Waits for the product <select> to hold real options (beyond its placeholder) and returns their labels. */
async function waitForProductOptions(page: Page): Promise<string[]> {
  const deadline = Date.now() + OPTIONS_LOAD_MS;
  for (;;) {
    const labels = await optionLabels(page, PRODUCT_SELECT);
    const real = labels.filter((l) => l && !/^בחר/.test(l));
    if (real.length > 0) return real;
    if (Date.now() > deadline) return [];
    await page.waitForTimeout(500);
  }
}

/** Resolves with the list API's status once the search's round trip answers, null when it never does. */
function watchListRoundTrip(page: Page): Promise<number | null> {
  return page
    .waitForResponse((res) => res.url().includes(LIST_API_MARKER), { timeout: FILTER_SETTLE_MS })
    .then((res) => res.status())
    .catch(() => null);
}

/**
 * What an answered search shows. The no-data text wins; otherwise any row link
 * means rows. The heading is not required: a single result shows "תהליך הפקת
 * האישור הסתיים בהצלחה" instead of "נמצאו N תוצאות" (seen live 2026-11-28 in
 * the owner's account). Null = neither yet. Pure.
 */
export function listOutcomeOf(bodyText: string, rowLinkCount: number): 'rows' | 'empty' | null {
  if (bodyText.includes(EMPTY_TEXT)) return 'empty';
  if (rowLinkCount > 0) return 'rows';
  return null;
}

/** After an answered search: result rows or the no-data text must show. */
async function waitForListOutcome(page: Page): Promise<'rows' | 'empty'> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const text = await page.locator('body').innerText().catch(() => '');
    const outcome = listOutcomeOf(text, await page.locator(ROW_LINK).count());
    if (outcome) return outcome;
    if (Date.now() > deadline) throw new Error('the search answered but the page shows neither results nor the no-data text');
    await page.waitForTimeout(500);
  }
}

/** The result rows: every title link (the PDF-icon twin has no text) with its index among all row links. */
async function readRows(page: Page): Promise<MigdalRow[]> {
  const texts = await page.locator(ROW_LINK).allTextContents();
  return texts.map((title, index) => ({ index, title })).filter((r) => r.title.trim().length > 0);
}

/** Clicks (via `trigger`) and returns the single PDF that click downloads. */
async function captureDownload(page: Page, trigger: () => Promise<void>): Promise<{ buffer: Buffer; filename: string }> {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS }), trigger()]);
  const path = await (download as Download).path();
  if (!path) throw new Error('download produced no file');
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(path);
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(`migdal download is not a PDF (${buffer.length} bytes, starts ${JSON.stringify(buffer.subarray(0, 8).toString('latin1'))})`);
  }
  return { buffer, filename: download.suggestedFilename() };
}

/** A filename-safe slug of a Hebrew report title. */
function slug(text: string): string {
  return text.replace(/[^\w֐-׿]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}
