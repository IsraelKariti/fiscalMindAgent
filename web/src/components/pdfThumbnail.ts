/**
 * First-page thumbnails of PDFs for the timeline's attachment chips (openspec
 * `conversation-attachments`, design decisions 1 and 3).
 *
 * pdf.js is imported on demand so it lands in its own chunk: the main bundle
 * does not pay for it, and a conversation with no PDF never loads it. Results
 * are cached per file id for the page's lifetime as a promise, so two chips of
 * the same file (or a strict-mode double mount) share one render, and the
 * timeline re-rendering on a new message never draws a page twice. A failed
 * render resolves to null; the chip then falls back to the icon-only look.
 */

const THUMB_WIDTH = 320;
const JPEG_QUALITY = 0.6;
const MAX_CONCURRENT = 3;

const cache = new Map<string, Promise<string | null>>();

// A small gate so a long chat scrolling into view does not start every render
// at once and freeze the UI thread.
let running = 0;
const waiting: Array<() => void> = [];
async function acquire(): Promise<() => void> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  return () => {
    running -= 1;
    waiting.shift()?.();
  };
}

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      // Vite emits the worker as an asset next to the chunks for every entry
      // (dashboard, monday-object, picker), so the URL resolves in all three.
      mod.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return mod;
    });
  }
  return pdfjsPromise;
}

async function render(url: string): Promise<string | null> {
  const release = await acquire();
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const data = new Uint8Array(await res.arrayBuffer());
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data, stopAtErrors: false }).promise;
    try {
      if (doc.numPages < 1) return null;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // Pages are transparent where nothing is drawn; paint paper underneath.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    } finally {
      await doc.destroy();
    }
  } catch {
    return null;
  } finally {
    release();
  }
}

/** The first page of the PDF at `url` as a JPEG data URL, or null when it cannot be drawn. */
export function pdfThumbnail(fileId: string, url: string): Promise<string | null> {
  let hit = cache.get(fileId);
  if (!hit) {
    hit = render(url);
    cache.set(fileId, hit);
  }
  return hit;
}
