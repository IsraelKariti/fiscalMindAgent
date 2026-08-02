import type { Page } from 'playwright';
import { debugShot, typeHuman } from './launch.js';
import { logger } from '../util/logger.js';
import { captureNextPdf } from './pdfCapture.js';
import {
  OtpRejectedError,
  requireCredential,
  type DocumentFetchProvider,
  type FetchedDocument,
  type PortalCredentials,
} from './providerTypes.js';

const LOGIN_URL = 'https://secapp.taxes.gov.il/taxes-login/login/general';
const PERSONAL_AREA_URL = 'https://secapp.taxes.gov.il/sr-ezor-ishi/main/main-page';

/**
 * Israeli Tax Authority (רשות המסים) portal. Ported from the standalone
 * meitav-vm-browser-login server: logs in with national ID + permanent user
 * code, verifies the emailed OTP, and downloads a year's Form 106 (טופס 106)
 * for EVERY employer listed under that year, plus the year's all-employers
 * salary summary (ריכוז נתוני שכר) when the site offers one. Selectors track
 * the site's Hebrew Angular UI and are the brittle part.
 *
 * Delivery mechanics (verified live 2026-07-25): clicking להצגת טופס 106 does
 * not navigate or download — the page JS fetches the PDF bytes, wraps them in
 * an application/pdf Blob and window.opens the blob: URL in a viewer popup.
 * The form106 page stays alive, so the links can be clicked sequentially.
 */
export const israelTaxAuthorityProvider: DocumentFetchProvider = {
  id: 'israel_tax_authority',

  async startLogin(page: Page, credentials: PortalCredentials): Promise<void> {
    const idNumber = requireCredential(credentials, 'idNumber', 'israel_tax_authority');
    const userCode = requireCredential(credentials, 'userCode', 'israel_tax_authority');

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('#ID', { state: 'visible' });
    await debugShot(page, 'taxes-01-page-loaded');

    await typeHuman(page, page.locator('#ID'), idNumber);
    await page.keyboard.press('Tab');
    await typeHuman(page, page.locator('#code'), userCode);
    await page.keyboard.press('Tab');
    await debugShot(page, 'taxes-02-credentials-filled');

    await page.locator('button.btn-primary', { hasText: 'המשך' }).click();
    // The OTP screen is where the site emails the client the code.
    await page.waitForURL((url) => url.href.includes('otp'), { timeout: 30_000 });
    await debugShot(page, 'taxes-03-otp-screen');
  },

  async submitOtp(page: Page, otp: string): Promise<void> {
    await typeHuman(page, page.locator('#onetimecode'), otp);
    await page.keyboard.press('Tab');
    await debugShot(page, 'taxes-04-otp-filled');

    await page.locator('button.btn-primary', { hasText: 'כניסה' }).click();

    // Success = navigation to the personal area. A wrong code leaves us on the
    // OTP screen; distinguish the two so the caller can re-ask vs. hard-fail.
    try {
      await page.waitForURL((url) => url.href.includes('sr-ezor-ishi/main/main-page'), { timeout: 30_000 });
    } catch (err) {
      if (page.url().includes('otp')) throw new OtpRejectedError();
      throw err;
    }
    await debugShot(page, 'taxes-05-authenticated');
  },

  async downloadDocuments(page: Page, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    // Single document type ('form106'); documentKeys is irrelevant here — one
    // login always yields every employer's 106 plus the salary summary.
    const year = String(opts.taxYear);

    // Step 1: personal area → open the Form 106 page (skip if already there).
    if (!page.url().includes('form106')) {
      if (!page.url().includes('sr-ezor-ishi/main/main-page')) {
        await page.goto(PERSONAL_AREA_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      }
      await page.waitForSelector('text=טפסי 106', { timeout: 30_000 });
      await debugShot(page, 'taxes-06-personal-area');
      await page.locator('text=טפסי 106').first().click();
      await page.waitForURL((url) => url.href.includes('sr-ezor-ishi/main/form106'), { timeout: 30_000 });
    }

    // Step 2: wait for the year accordion to render.
    await page.waitForSelector('details.accordion__item', { timeout: 15_000 });
    await debugShot(page, 'taxes-07-form106-loaded');

    // Step 3: expand the requested year's accordion if it isn't open already.
    // (The employer rows exist in the DOM even collapsed, but the links must be
    // visible to click.)
    const yearLinks = page.locator(`a[role="button"][aria-label*="${year}"]`);
    if (!(await yearLinks.first().isVisible().catch(() => false))) {
      await page.locator('h3.accordion__heading', { hasText: year }).first().click();
      await page.waitForSelector(`a[role="button"][aria-label*="${year}"]`, { timeout: 10_000 });
    }
    await debugShot(page, 'taxes-08-accordion-open');

    // Step 4: find every download link under the year and classify each one.
    // The links' aria-labels all contain the year, so row scoping is what tells
    // them apart: each employer's להצגת טופס 106 link sits in its own div.row
    // together with <strong>employer name</strong> and <strong>deduction-file
    // number</strong> (exactly one link per row), while the year-wide ריכוז
    // נתוני שכר (all-employers salary summary) link hangs off the container row
    // that wraps the whole employer table. Matching div.row by "has a link"
    // alone would sweep that container in as a phantom employer — verified live
    // 2026-07-25 (2 employers came back as 3 files, the summary mislabeled with
    // the first employer's name).
    const linkCss = `a[role="button"][aria-label*="${year}"]`;
    type LinkInfo = { kind: 'form106' | 'salary_summary'; employerName: string | null; deductionFile: string };
    // (tsconfig has no `dom` lib — the callback runs in the browser, so DOM
    // globals are reached through an untyped handle. No named function bindings
    // inside the callback either: under tsx, esbuild's keepNames rewrites them
    // as __name(fn, ...) with the helper defined at module level, which doesn't
    // exist in the serialized callback the page evals — ReferenceError.)
    const links = (await page.evaluate((sel) => {
      const doc = (globalThis as { document?: any }).document;
      return Array.from(doc.querySelectorAll(sel) as ArrayLike<any>).map((a: any) => {
        const row = a.closest('div.row');
        // An employer row holds exactly its own link; the summary link's nearest
        // div.row is the container, which holds every link under the year.
        if (!row || row.querySelectorAll(sel).length !== 1) {
          return { kind: 'salary_summary', employerName: null, deductionFile: '' };
        }
        // strong order within the row: employer name, deduction-file number,
        // then the one wrapping the link itself.
        const strongs = row.querySelectorAll('strong');
        const employerName = strongs[0]?.textContent ? String(strongs[0].textContent).trim() : '';
        const deductionFile = strongs[1]?.textContent ? String(strongs[1].textContent).trim() : '';
        return { kind: 'form106', employerName: employerName || null, deductionFile };
      });
    }, linkCss)) as LinkInfo[];
    if (links.length === 0) throw new Error(`no Form 106 links found for year ${year}`);
    logger.info('tax fetch: form-106 links found', {
      year,
      employers: links.filter((l) => l.kind === 'form106').length,
      summaries: links.filter((l) => l.kind === 'salary_summary').length,
    });

    const docs: FetchedDocument[] = [];
    const usedFilenames = new Set<string>();
    for (const [i, info] of links.entries()) {
      const link = page.locator(linkCss).nth(i);
      const fallbackBase =
        info.kind === 'salary_summary'
          ? `salary_summary_${year}`
          : info.deductionFile
            ? `form_106_${year}_${info.deductionFile}`
            : `form_106_${year}_${i + 1}`;
      const captured = await captureNextPdf(page, () => link.click(), `${fallbackBase}.pdf`);

      let filename = captured.filename;
      if (usedFilenames.has(filename)) filename = `${fallbackBase}_${i + 1}.pdf`;
      usedFilenames.add(filename);

      docs.push({ buffer: captured.buffer, filename, contentType: 'application/pdf', employerName: info.employerName, kind: info.kind });
      logger.info('tax fetch: document captured', { year, kind: info.kind, employerName: info.employerName, bytes: captured.buffer.length });
      await debugShot(page, `taxes-09-after-download-${i + 1}`);
    }
    return docs;
  },
};
