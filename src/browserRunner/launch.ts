import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { runnerEnv } from './env.js';

export interface LaunchedSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Opens a real Chrome (system-installed, via channel:'chrome') on a fresh
 * context configured to look like an ordinary Israeli user. Headful because the
 * tax authority's login trips headless bot-detection; in production this runs
 * under Xvfb (Dockerfile.browser-runner). No persistent profile — a fetch is
 * always a fresh login.
 */
export async function launchInteractivePage(): Promise<LaunchedSession> {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
  });
  const page = await context.newPage();
  return { browser, context, page };
}

const rand = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Types text one character at a time with small random delays. The site's forms
 * are Angular reactive forms — `locator.fill()` sets the value without firing
 * the per-keystroke input events Angular's change detection needs, so the field
 * looks empty on submit. Keep the char-by-char typing.
 */
export async function typeHuman(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.click();
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(rand(80, 150));
  }
}

/** Best-effort step screenshot when TAX_FETCH_DEBUG_DIR is set; never throws. */
export async function debugShot(page: Page, name: string): Promise<void> {
  if (!runnerEnv.TAX_FETCH_DEBUG_DIR) return;
  try {
    await page.screenshot({ path: `${runnerEnv.TAX_FETCH_DEBUG_DIR}/${name}.png`, fullPage: true });
  } catch {
    /* debugging aid only */
  }
}
