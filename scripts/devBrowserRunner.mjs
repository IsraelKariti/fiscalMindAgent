// Dev launcher for the browser-runner sidecar (src/browserRunner.ts). Skips
// cleanly when BROWSER_RUNNER_TOKEN isn't set — mock-mode tax fetches
// (TAX_FETCH_MOCK=true) never need the runner.
//
// The child is spawned with every .env-sourced variable STRIPPED except the
// runner's own: the whole point of the sidecar is that the process driving
// Chrome (and therefore Chrome's own subprocesses, which inherit its
// environment) never holds DB/API credentials. System vars (PATH etc.) pass
// through untouched.
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';

const RUNNER_KEYS = new Set([
  'BROWSER_RUNNER_PORT',
  'BROWSER_RUNNER_TOKEN',
  'TAX_FETCH_SESSION_TTL_MS',
  'TAX_FETCH_DEBUG_DIR',
]);

const fileVars = existsSync('.env') ? parse(readFileSync('.env')) : {};

if (!(process.env.BROWSER_RUNNER_TOKEN ?? fileVars.BROWSER_RUNNER_TOKEN)) {
  console.error('devBrowserRunner: BROWSER_RUNNER_TOKEN is not set in .env — skipping the browser runner (mock-mode tax fetches do not need it).');
  process.exit(0);
}

const childEnv = { ...process.env };
for (const key of Object.keys(fileVars)) {
  if (!RUNNER_KEYS.has(key)) delete childEnv[key];
}
for (const key of RUNNER_KEYS) {
  if (fileVars[key] && childEnv[key] === undefined) childEnv[key] = fileVars[key];
}

const child = spawn('node', ['--watch-path=./src', '--import', 'tsx', 'src/browserRunner.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: childEnv,
});
child.on('exit', (code) => process.exit(code ?? 0));
