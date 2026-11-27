/**
 * Owner check of a fetch provider's egress route (openspec `fetch-egress-proxy`):
 *
 *   npm run proxy:check -- phoenix
 *
 * Launches the runner's Chrome exactly as a session of that provider would
 * (same flags, same DOCUMENT_FETCH_PROXY_<PROVIDER> from the root .env),
 * prints the exit address the internet sees and the HTTP status of the
 * provider's check URL, then exits 0 only when that status is 200. A refused
 * proxy or a dead address prints the browser's error and exits 1. Runs on the
 * owner's machine only (the worker image has no Chrome); to check the
 * production value, put it in the local .env for the run.
 */
import { launchInteractivePage } from '../src/browserRunner/launch.js';

/** What must load for the provider's login to work; Phoenix's login form is a script on a second host. */
const CHECK_URLS: Record<string, string> = {
  phoenix: 'https://auth0-login.fnx-public.com/index.js',
  harel: 'https://www.harel-group.co.il/',
  migdal: 'https://www.migdal.co.il/',
  meitav: 'https://customers.meitav.co.il/',
  menora_mivtachim: 'https://www.menoramivt.co.il/',
  altshuler_shaham: 'https://www.as-invest.co.il/',
  israel_tax_authority: 'https://www.gov.il/',
};

const IP_URL = 'https://api.ipify.org?format=json';
const NAV_TIMEOUT_MS = 60_000;

async function main(): Promise<number> {
  const providerId = process.argv[2];
  if (!providerId || !(providerId in CHECK_URLS)) {
    console.error(`usage: npm run proxy:check -- <provider>\nproviders: ${Object.keys(CHECK_URLS).join(', ')}`);
    return 2;
  }
  const checkUrl = CHECK_URLS[providerId] as string;
  let launched: Awaited<ReturnType<typeof launchInteractivePage>> | null = null;
  try {
    launched = await launchInteractivePage(providerId);
    console.log(`egress: ${launched.egress.mode === 'proxy' ? `proxy ${launched.egress.host}` : 'direct'}`);
    const { page } = launched;

    const ipResponse = await page.goto(IP_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    const ipText = (await ipResponse?.text().catch(() => '')) ?? '';
    const ip = /"ip"\s*:\s*"([^"]+)"/.exec(ipText)?.[1] ?? ipText.trim().slice(0, 60);
    console.log(`exit_ip: ${ip} (status ${ipResponse?.status() ?? 'none'})`);

    const check = await page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    const status = check?.status() ?? 0;
    console.log(`check_url: ${checkUrl}\ncheck_status: ${status}`);
    if (status !== 200) {
      console.error(`FAIL: expected 200 from the check URL, got ${status}`);
      return 1;
    }
    console.log('OK');
    return 0;
  } catch (err) {
    // Playwright's message names the proxy failure (ERR_PROXY_CONNECTION_FAILED, ERR_TUNNEL_CONNECTION_FAILED, 407...).
    console.error(`FAIL: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    return 1;
  } finally {
    await launched?.browser.close().catch(() => undefined);
  }
}

process.exitCode = await main();
