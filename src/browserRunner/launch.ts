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
 *
 * `--disable-quic` is load-bearing, not hygiene: Harel's login shell mounts as
 * a single-spa micro-frontend whose bootstrap (`apps-root-config-frontend/
 * root-config.js`) is served over HTTP/3 from CloudFront. QUIC connections to
 * that host get reset in our egress environment, so on a fresh profile — which,
 * unlike a warm daily browser, must actually fetch it — root-config.js dies with
 * ERR_CONNECTION_RESET, no app mounts, and the page hangs on a blank background.
 * Forcing HTTP/1.1+2 over TCP avoids the flaky QUIC path (diagnosed 2026-08-03;
 * this, not bot-detection, was the "Harel won't load" symptom). Applies to every
 * provider — TCP is universally reliable here.
 *
 * The anti-automation flags are ordinary hygiene: `--enable-automation` (dropped
 * via ignoreDefaultArgs) makes `navigator.webdriver` return true and enables the
 * AutomationControlled Blink feature that fingerprinting scripts probe. Dropping
 * both leaves an honest `navigator.webdriver === false` rather than patching the
 * tell after the fact.
 */
export async function launchInteractivePage(): Promise<LaunchedSession> {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', '--disable-quic'],
  });
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await context.newPage();
  return { browser, context, page };
}

const rand = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Types text one character at a time with slow random delays (1–2s per char,
 * like a person reading digits off a card). The site's forms are Angular
 * reactive forms — `locator.fill()` sets the value without firing the
 * per-keystroke input events Angular's change detection needs, so the field
 * looks empty on submit. Keep the char-by-char typing.
 */
export async function typeHuman(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.click();
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(rand(1_000, 2_000));
  }
}

/**
 * Random pre-action pause so clicks and navigations arrive at a human cadence
 * instead of back-to-back. The default 5–20s is for page-level actions; pass a
 * tighter range for micro-steps. Ranges are budgeted against the 10-minute
 * session TTL (TAX_FETCH_SESSION_TTL_MS) — a whole fetch, including per-row
 * pauses, must stay well inside it. OTP submission must NOT get a long pause:
 * the sites' one-time codes expire within minutes of the client receiving them.
 */
export async function humanPause(page: Page, minMs = 5_000, maxMs = 20_000): Promise<void> {
  await page.waitForTimeout(rand(minMs, maxMs));
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
