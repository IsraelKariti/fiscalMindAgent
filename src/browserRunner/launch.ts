import { chromium, type Browser, type BrowserContext, type LaunchOptions, type Locator, type Page } from 'playwright';
import { proxyFor, runnerEnv } from './env.js';
import { StepCollector, captureStep, type Egress, type EvidenceItem } from './stepEvidence.js';

/**
 * The step-evidence collector of each page the runner drives (openspec
 * `fetch-step-evidence`). Attached in launchInteractivePage(); the server
 * reads it by page to serve the items to the worker.
 */
const collectors = new WeakMap<Page, StepCollector>();

export function collectorOf(page: Page): StepCollector | undefined {
  return collectors.get(page);
}

/**
 * Attaches a collector and the console / error-response listeners that feed
 * the next step's record. The egress is written on the session's first record
 * only (openspec `fetch-egress-proxy`).
 */
export function attachCollector(page: Page, egress: Egress = { mode: 'direct' }, collector = new StepCollector()): StepCollector {
  collector.setEgress(egress);
  collectors.set(page, collector);
  page.on('console', (msg) => {
    collector.pushConsole({ at: new Date().toISOString(), type: msg.type(), text: msg.text().slice(0, 2_000) });
  });
  page.on('pageerror', (err) => {
    collector.pushConsole({ at: new Date().toISOString(), type: 'pageerror', text: String(err.message ?? err).slice(0, 2_000) });
  });
  page.on('response', (res) => {
    if (res.status() < 400) return;
    collector.pushResponse({ at: new Date().toISOString(), method: res.request().method(), url: res.url().slice(0, 2_000), status: res.status(), failure: null });
  });
  page.on('requestfailed', (req) => {
    collector.pushResponse({
      at: new Date().toISOString(),
      method: req.method(),
      url: req.url().slice(0, 2_000),
      status: null,
      failure: req.failure()?.errorText ?? 'request failed',
    });
  });
  return collector;
}

export type { Egress } from './stepEvidence.js';

export interface LaunchedSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  egress: Egress;
}

/** What chromium.launch receives for a provider; pure, exported for the test. */
export function launchOptionsFor(providerId?: string): { options: LaunchOptions; egress: Egress } {
  const options: LaunchOptions = {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', '--disable-quic'],
  };
  const proxy = providerId ? proxyFor(providerId) : null;
  if (!proxy) return { options, egress: { mode: 'direct' } };
  return {
    options: { ...options, proxy: { server: proxy.server, username: proxy.username, password: proxy.password } },
    egress: { mode: 'proxy', host: proxy.host },
  };
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
 *
 * A provider with a configured egress proxy (DOCUMENT_FETCH_PROXY_<PROVIDER>,
 * openspec `fetch-egress-proxy`) gets Playwright's `proxy` launch option:
 * Chrome then sends every request — pages, scripts, frames, downloads —
 * through it, and Playwright answers the proxy's 407 with the credentials.
 * Every other provider launches exactly as before. Phoenix needs this: its
 * login script is not served to the platform's Azure address.
 */
export async function launchInteractivePage(providerId?: string): Promise<LaunchedSession> {
  const { options, egress } = launchOptionsFor(providerId);
  const browser = await chromium.launch(options);
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await context.newPage();
  attachCollector(page, egress);
  return { browser, context, page, egress };
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
 * session TTL (DOCUMENT_FETCH_SESSION_TTL_MS) — a whole fetch, including per-row
 * pauses, must stay well inside it. OTP submission must NOT get a long pause:
 * the sites' one-time codes expire within minutes of the client receiving them.
 */
export async function humanPause(page: Page, minMs = 5_000, maxMs = 20_000): Promise<void> {
  await page.waitForTimeout(rand(minMs, maxMs));
}

/**
 * Records the step's evidence (screenshot, HTML, MHTML, record — see
 * stepEvidence.ts) on the page's collector, and, when DOCUMENT_FETCH_DEBUG_DIR is
 * set, also saves the screenshot there (dev only). Never throws. Every
 * provider calls this at each of its steps; the name is the step's label.
 */
export async function debugShot(page: Page, name: string, error: string | null = null): Promise<EvidenceItem | null> {
  let item: EvidenceItem | null = null;
  const collector = collectors.get(page);
  if (collector) {
    try {
      item = await captureStep(page, collector, name, error);
    } catch {
      /* evidence is best-effort */
    }
  }
  if (runnerEnv.DOCUMENT_FETCH_DEBUG_DIR) {
    try {
      await page.screenshot({ path: `${runnerEnv.DOCUMENT_FETCH_DEBUG_DIR}/${name}.png`, fullPage: true });
    } catch {
      /* debugging aid only */
    }
  }
  return item;
}
