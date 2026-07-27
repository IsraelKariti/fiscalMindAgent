import type { Download, Page, Response } from 'playwright';

/** Per-click PDF capture window; the sites build the blob locally so it's usually fast. */
export const PDF_CAPTURE_TIMEOUT_MS = 30_000;

/**
 * Clicks (via `trigger`) and captures the single PDF that click produces,
 * racing four delivery mechanisms: a popup on a blob: URL whose bytes we
 * re-fetch from the opener (same-origin; the tax authority's observed method),
 * plus a real download event and an application/pdf response on the page or on
 * a popup, in case the site delivers differently or changes. Listeners are
 * detached and viewer popups closed before returning, so the capture can run
 * once per document row.
 */
export async function captureNextPdf(
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

    // Mechanism 1: viewer popup on a blob: URL. The blob shares the opener's
    // origin, so fetching it from the main page returns the exact PDF the
    // viewer shows regardless of how the server transported the bytes.
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
