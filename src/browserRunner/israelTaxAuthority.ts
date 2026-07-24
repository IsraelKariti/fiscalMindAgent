import type { Page } from 'playwright';
import { debugShot, typeHuman } from './launch.js';
import { logger } from '../util/logger.js';
import { OtpRejectedError, type DocumentFetchProvider, type FetchedDocument, type PortalLoginCredentials } from './providerTypes.js';

const LOGIN_URL = 'https://secapp.taxes.gov.il/taxes-login/login/general';
const PERSONAL_AREA_URL = 'https://secapp.taxes.gov.il/sr-ezor-ishi/main/main-page';

/**
 * Israeli Tax Authority (רשות המסים) portal. Ported from the standalone
 * meitav-vm-browser-login server: logs in with national ID + permanent user
 * code, verifies the SMS OTP, and downloads a year's Form 106 (טופס 106).
 * Selectors track the site's Hebrew Angular UI and are the brittle part.
 */
export const israelTaxAuthorityProvider: DocumentFetchProvider = {
  id: 'israel_tax_authority',

  async startLogin(page: Page, creds: PortalLoginCredentials): Promise<void> {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('#ID', { state: 'visible' });
    await debugShot(page, 'taxes-01-page-loaded');

    await typeHuman(page, page.locator('#ID'), creds.idNumber);
    await page.keyboard.press('Tab');
    await typeHuman(page, page.locator('#code'), creds.userCode);
    await page.keyboard.press('Tab');
    await debugShot(page, 'taxes-02-credentials-filled');

    await page.locator('button.btn-primary', { hasText: 'המשך' }).click();
    // The OTP screen is where the site texts the client the code.
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

  async downloadDocument(page: Page, opts: { taxYear: number }): Promise<FetchedDocument> {
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
    const yearLink = page.locator(`a[role="button"][aria-label*="${year}"]`).first();
    if (!(await yearLink.isVisible().catch(() => false))) {
      await page.locator('h3.accordion__heading', { hasText: year }).first().click();
      await page.waitForSelector(`a[role="button"][aria-label*="${year}"]`, { timeout: 10_000 });
    }
    await debugShot(page, 'taxes-08-accordion-open');

    const linkCount = await page.locator(`a[role="button"][aria-label*="${year}"]`).count();
    if (linkCount > 1) {
      // Multiple employers → multiple 106s. v1 downloads the first; note the rest.
      logger.info('tax fetch: multiple form-106 links for year, downloading first', { year, linkCount });
    }

    // Step 4: race the three ways Angular might deliver the PDF (unchanged from
    // the source): a Playwright download event, a response with a PDF
    // content-type, or the same on a popup page.
    let captured = false;
    const pdfCapture = new Promise<{ buffer: Buffer; filename: string }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('PDF not captured within 30s — the site may have changed its delivery method')),
        30_000,
      );
      const done = (result: { buffer: Buffer; filename: string }) => {
        if (captured) return;
        captured = true;
        clearTimeout(timer);
        resolve(result);
      };

      page.once('download', (dl) => {
        dl.path()
          .then(async (path) => {
            if (!path) return;
            const { readFile } = await import('node:fs/promises');
            done({ buffer: await readFile(path), filename: dl.suggestedFilename() || `form_106_${year}.pdf` });
          })
          .catch(() => {
            /* another mechanism may still win */
          });
      });

      const attachResponseHandler = (p: Page) => {
        p.on('response', async (response) => {
          if (captured) return;
          const ct = response.headers()['content-type'] ?? '';
          if (!ct.includes('application/pdf')) return;
          try {
            const body = await response.body();
            const urlName = new URL(response.url()).pathname.split('/').pop() || `form_106_${year}.pdf`;
            const filename = urlName.toLowerCase().endsWith('.pdf') ? urlName : `${urlName}.pdf`;
            done({ buffer: body, filename });
          } catch {
            /* body already consumed; let another mechanism win */
          }
        });
      };
      attachResponseHandler(page);
      page.context().on('page', (newPage) => attachResponseHandler(newPage));
    });

    await yearLink.click();
    const result = await pdfCapture;
    await debugShot(page, 'taxes-09-after-download');

    return { buffer: result.buffer, filename: result.filename, contentType: 'application/pdf' };
  },
};
