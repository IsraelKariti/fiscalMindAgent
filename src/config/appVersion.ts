import { execFileSync } from 'node:child_process';

/**
 * The version of the app this process runs (openspec `cost-per-version`):
 * the short git commit it was built from. The deploy workflows stamp the
 * containers with GIT_SHA; a local run reads the working tree once at
 * start; 'dev' when neither is known. Every llm_calls row carries it, so
 * the admin versions page can compare builds by cost per unit of work.
 */
export function resolveAppVersion(
  gitSha: string | undefined = process.env.GIT_SHA,
  exec: () => string = () => execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }),
): string {
  const stamped = gitSha?.trim();
  if (stamped) return stamped.slice(0, 7);
  try {
    const sha = exec().trim();
    if (/^[0-9a-f]{7,40}$/i.test(sha)) return sha.slice(0, 7);
  } catch {
    // No git on the path, or not a working tree.
  }
  return 'dev';
}

/** Resolved once per process; every call of this process carries the same value. */
export const APP_VERSION = resolveAppVersion();
