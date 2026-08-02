import type { Download, Page } from 'playwright';
import { debugShot, humanPause, typeHuman } from './launch.js';
import { logger } from '../util/logger.js';
import {
  OtpRejectedError,
  requireCredential,
  type DocumentFetchProvider,
  type FetchedDocument,
  type PortalCredentials,
} from './providerTypes.js';

const LOGIN_URL = 'https://online.as-invest.co.il/login';
const REPORTS_URL = 'https://online.as-invest.co.il/periodic-reports-and-tax-certificates';

/** The report clicked under each product tab; pension and study fund share the same on-screen label. */
const TARGET_REPORT_LABEL = 'דוח שנתי מקוצר ואישורי מס';

/**
 * Which product tab on the reports page each document-type key lives under.
 * The study fund (קרן השתלמות) is a gemel-family product, so it sits under גמל;
 * the pension under פנסיה.
 */
const TAB_FOR_KEY: Record<string, string> = {
  pension_annual: 'פנסיה',
  study_fund_annual: 'גמל',
};

/** Per-click download window; the site builds the blob locally so it's usually fast. */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Altshuler Shaham personal area (online.as-invest.co.il). Logs in with national
 * ID + phone, verifies the SMS one-time code, and downloads a year's pension
 * "short annual report + tax certificates" (דוח שנתי מקוצר ואישורי מס).
 *
 * Flow verified live 2026-07-26. The site is an Angular SPA with an invisible
 * reCAPTCHA that human-style typing + the webdriver mask (launch.ts) passes.
 * Selectors track its Hebrew UI and are the brittle part; several inputs have no
 * id/name and are reached by placeholder text.
 */
export const altshulerShahamProvider: DocumentFetchProvider = {
  id: 'altshuler_shaham',

  async startLogin(page: Page, credentials: PortalCredentials): Promise<void> {
    const idNumber = requireCredential(credentials, 'idNumber', 'altshuler_shaham');
    const phoneNumber = normalizePhone(requireCredential(credentials, 'phoneNumber', 'altshuler_shaham'));

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('input[placeholder=".מספר ת.ז"]', { state: 'visible', timeout: 30_000 });
    await debugShot(page, 'as-01-page-loaded');

    await humanPause(page, 2_000, 6_000); // "reading" the form before typing
    // ID-type radio (ת"ז) is the default; select it defensively before typing.
    const idRadio = page.locator('#externalIdType');
    if (!(await idRadio.isChecked().catch(() => false))) await idRadio.check().catch(() => undefined);
    await typeHuman(page, page.locator('input[placeholder=".מספר ת.ז"]'), idNumber);
    await page.keyboard.press('Tab');

    // OTP delivery by SMS (the default); the phone is a single 10-digit field.
    const smsRadio = page.locator('input#1[name="type"]');
    if (!(await smsRadio.isChecked().catch(() => false))) await smsRadio.check().catch(() => undefined);
    await typeHuman(page, page.locator('input[placeholder="מספר הטלפון שלי"]'), phoneNumber);
    await page.keyboard.press('Tab');
    await debugShot(page, 'as-02-credentials-filled');

    // Submitting sends the SMS one-time code and moves to the OTP screen.
    await humanPause(page);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.href.includes('verify-otp'), { timeout: 30_000 });
    await page.waitForSelector('#otpInput', { state: 'visible', timeout: 15_000 });
    await debugShot(page, 'as-03-otp-screen');
  },

  async submitOtp(page: Page, otp: string): Promise<void> {
    await typeHuman(page, page.locator('#otpInput'), otp);
    await page.keyboard.press('Tab');
    await debugShot(page, 'as-04-otp-filled');

    // Short pause only: the SMS code expires within minutes.
    await humanPause(page, 1_000, 3_000);
    await page.locator('button[type="submit"]').click();

    // Success navigates to the lobby; a wrong code stays on /verify-otp and pops
    // an Angular Material error dialog. Race the two so the caller can re-ask on
    // rejection vs. hard-fail on anything else.
    const outcome = await Promise.race([
      page
        .waitForURL((url) => url.href.includes('/lobby'), { timeout: 30_000 })
        .then(() => 'ok' as const),
      page
        .waitForSelector('.error-modal-container', { state: 'visible', timeout: 30_000 })
        .then(() => 'rejected' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome === 'rejected') {
      // Leave the page reusable for the next code: dismiss the dialog and clear
      // the field. The same/next SMS code then logs in (verified live).
      await page.locator('.error-modal-container button.close-icon').click().catch(() => undefined);
      await page.locator('#otpInput').click().catch(() => undefined);
      await page.keyboard.press('Control+A').catch(() => undefined);
      await page.keyboard.press('Delete').catch(() => undefined);
      throw new OtpRejectedError('Altshuler Shaham rejected the one-time code');
    }
    if (outcome === 'timeout') {
      throw new Error('login did not complete: neither the personal area nor an error dialog appeared within 30s');
    }
    await debugShot(page, 'as-05-authenticated');
  },

  async downloadDocuments(page: Page, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    const year = String(opts.taxYear);
    // Fetch the agreed types; default to pension when none was specified (older
    // single-document sessions).
    const keys = opts.documentKeys.length > 0 ? opts.documentKeys : ['pension_annual'];

    // The lobby shows a marketing dialog that intercepts clicks; dismiss it.
    await dismissMarketingPopup(page);

    // Open the reports page (skip the nav click if we're already there).
    if (!page.url().includes('periodic-reports-and-tax-certificates')) {
      await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await page.waitForSelector('text=דוחות תקופתיים ואישורי מס', { timeout: 30_000 });
    await page.waitForTimeout(1_500); // the marketing dialog renders a beat after navigation
    await dismissMarketingPopup(page);
    await debugShot(page, 'as-06-reports-page');

    const docs: FetchedDocument[] = [];
    for (const key of keys) {
      const tab = TAB_FOR_KEY[key];
      if (!tab) throw new Error(`altshuler: unknown document key "${key}"`);

      // The marketing dialog can re-open; clear it right before the tab click,
      // which it would otherwise intercept.
      await dismissMarketingPopup(page);
      // Product sub-tab (פנסיה / גמל). The label text appears more than once in
      // the DOM (some copies hidden), so pick the visible one.
      await humanPause(page);
      await page.getByText(tab, { exact: true }).filter({ visible: true }).first().click();
      await page.waitForTimeout(1_500);

      // Year selector is an Angular Material select: open it, then pick the year.
      await selectYear(page, year);
      await debugShot(page, `as-07-${key}-year-selected`);

      // The target report; clicking it triggers a browser download of the PDF.
      // Pension and study fund share this label, so the tab we're on determines
      // which product this file is.
      await humanPause(page, 5_000, 15_000); // human cadence between document downloads
      const captured = await captureDownload(page, () =>
        page.getByText(TARGET_REPORT_LABEL, { exact: false }).filter({ visible: true }).first().click(),
      );
      docs.push({ buffer: captured.buffer, filename: captured.filename, contentType: 'application/pdf', kind: key });
      logger.info('altshuler fetch: document captured', { year, key, filename: captured.filename, bytes: captured.buffer.length });
      await debugShot(page, `as-08-${key}-downloaded`);
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
 * Closes the marketing dialog if it's up. It can render late and re-open, so
 * keep closing (button, else Escape) until it's gone or we give up. Best-effort;
 * never throws.
 */
async function dismissMarketingPopup(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const dialog = page.locator('app-pop-up [role="dialog"], [role="dialog"]');
    if (!(await dialog.first().isVisible().catch(() => false))) return;
    const closeBtn = dialog.locator('button.close, button.close-icon, button[aria-label*="סגור"], [class*="close"]');
    if (await closeBtn.first().isVisible().catch(() => false)) {
      await closeBtn.first().click().catch(() => undefined);
    } else {
      await page.keyboard.press('Escape').catch(() => undefined);
    }
    await page.waitForTimeout(400);
  }
}

/** Sets the Angular Material year select to `year` (idempotent — a no-op if already selected). */
async function selectYear(page: Page, year: string): Promise<void> {
  const current = (await page.locator('mat-select .mat-select-value-text').first().textContent().catch(() => ''))?.trim();
  if (current === year) return;
  await page.locator('mat-select').first().click();
  await page.waitForTimeout(600);
  await page
    .locator('mat-option, [role="option"]')
    .filter({ hasText: new RegExp(`^\\s*${year}\\s*$`) })
    .first()
    .click({ timeout: 5_000 });
  await page.waitForTimeout(2_000); // let the document list re-render for the year
}

/** Clicks (via `trigger`) and returns the single PDF that click downloads. */
async function captureDownload(
  page: Page,
  trigger: () => Promise<void>,
): Promise<{ buffer: Buffer; filename: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS }),
    trigger(),
  ]);
  const path = await (download as Download).path();
  if (!path) throw new Error('download produced no file');
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(path);
  const filename = download.suggestedFilename() || `altshuler_pension_annual.pdf`;
  return { buffer, filename };
}
