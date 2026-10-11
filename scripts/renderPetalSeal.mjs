// One-off: renders web/public/petal-seal.svg (the product icon) to
// web/public/petal-seal.png, the built-in default WhatsApp sender picture.
// Meta accepts PNG/JPEG only, so the SVG cannot be sent as a profile picture.
// Re-run after changing the SVG: `node scripts/renderPetalSeal.mjs`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const SIZE = 640;
const root = process.cwd();
const svg = readFileSync(path.join(root, 'web/public/petal-seal.svg'), 'utf8');
const out = path.join(root, 'web/public/petal-seal.png');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#000">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${SIZE}" height="${SIZE}" style="display:block">` +
      `</body></html>`,
  );
  await page.locator('img').waitFor();
  await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
