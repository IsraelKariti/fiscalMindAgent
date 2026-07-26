import type { Download, Page, Response } from 'playwright';
import { debugShot, typeHuman } from './launch.js';
import { logger } from '../util/logger.js';
import {
  OtpRejectedError,
  requireCredential,
  type DocumentFetchProvider,
  type FetchedDocument,
  type PortalCredentials,
} from './providerTypes.js';

const LOGIN_URL = 'https://secapp.taxes.gov.il/taxes-login/login/general';
const PERSONAL_AREA_URL = 'https://secapp.taxes.gov.il/sr-ezor-ishi/main/main-page';

/** Per-click PDF capture window; the site builds the blob locally so it's usually fast. */
const PDF_CAPTURE_TIMEOUT_MS = 30_000;

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

  async downloadDocuments(page: Page, opts: { taxYear: number }): Promise<FetchedDocument[]> {
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
    // globals are reached through an untyped handle.)
    const links = (await page.evaluate((sel) => {
      const doc = (globalThis as { document?: any }).document;
      return Array.from(doc.querySelectorAll(sel) as ArrayLike<any>).map((a: any) => {
        const row = a.closest('div.row');
        // An employer row holds exactly its own link; the summary link's nearest
        // div.row is the container, which holds every link under the year.
        if (!row || row.querySelectorAll(sel).length !== 1) {
          return { kind: 'salary_summary', employerName: null, deductionFile: '' };
        }
        const strongs = row.querySelectorAll('strong');
        const text = (el: any) => (el && el.textContent ? String(el.textContent).trim() : '');
        // strong order within the row: employer name, deduction-file number,
        // then the one wrapping the link itself.
        return { kind: 'form106', employerName: text(strongs[0]) || null, deductionFile: text(strongs[1]) };
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

/**
 * Clicks (via `trigger`) and captures the single PDF that click produces,
 * racing four delivery mechanisms: the observed one — a popup on a blob: URL
 * whose bytes we re-fetch from the opener (same-origin) — plus the legacy
 * three (download event, application/pdf response on the page or on a popup)
 * in case the site changes. Listeners are detached and viewer popups closed
 * before returning, so the capture can run once per employer row.
 */
async function captureNextPdf(
  page: Page,
  trigger: () => Promise<void>,
  fallbackFilename: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const context = page.context();
  const popups: Page[] = [];
  let captured = false;

  let onDownload: (dl: Download) => void = () => {};
  let onResponse: (response: Response) => void = () => {};
  let onPage: (p: Page) => void = () => {};

  const capture = new Promise<{ buffer: Buffer; filename: string }>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('PDF not captured within 30s — the site may have changed its delivery method')),
      PDF_CAPTURE_TIMEOUT_MS,
    );
    const done = (result: { buffer: Buffer; filename: string }) => {
      if (captured) return;
      captured = true;
      clearTimeout(timer);
      resolve(result);
    };

    // Mechanism 1 (observed live): viewer popup on a blob: URL. The blob shares
    // the opener's origin, so fetching it from the main page returns the exact
    // PDF the viewer shows regardless of how the server transported the bytes.
    onPage = (p: Page) => {
      popups.push(p);
      void (async () => {
        try {
          await p.waitForURL(/^blob:/, { timeout: PDF_CAPTURE_TIMEOUT_MS }).catch(() => undefined);
          const blobUrl = p.url();
          if (captured || !blobUrl.startsWith('blob:')) return;
          const base64 = await page.evaluate(async (url: string) => {
            const res = await fetch(url);
            const bytes = new Uint8Array(await res.arrayBuffer());
            let bin = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
              bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            }
            return btoa(bin);
          }, blobUrl);
          done({ buffer: Buffer.from(base64, 'base64'), filename: fallbackFilename });
        } catch {
          /* another mechanism may still win */
        }
      })();
    };

    // Mechanism 2: a real browser download.
    onDownload = (dl: Download) => {
      dl.path()
        .then(async (path) => {
          if (!path) return;
          const { readFile } = await import('node:fs/promises');
          done({ buffer: await readFile(path), filename: dl.suggestedFilename() || fallbackFilename });
        })
        .catch(() => {
          /* another mechanism may still win */
        });
    };

    // Mechanisms 3+4: an application/pdf response on the main page or a popup.
    onResponse = (response: Response) => {
      if (captured) return;
      const ct = response.headers()['content-type'] ?? '';
      if (!ct.includes('application/pdf')) return;
      void response
        .body()
        .then((body) => {
          const urlName = new URL(response.url()).pathname.split('/').pop() || fallbackFilename;
          const filename = urlName.toLowerCase().endsWith('.pdf') ? urlName : `${urlName}.pdf`;
          done({ buffer: body, filename });
        })
        .catch(() => {
          /* body already consumed; let another mechanism win */
        });
    };

    page.on('download', onDownload);
    page.on('response', onResponse);
    context.on('page', onPage);
  });

  try {
    await trigger();
    return await capture;
  } finally {
    page.off('download', onDownload);
    page.off('response', onResponse);
    context.off('page', onPage);
    // Close viewer popups so the next click's popup is unambiguous.
    await Promise.all(popups.map((p) => p.close().catch(() => undefined)));
  }
}
