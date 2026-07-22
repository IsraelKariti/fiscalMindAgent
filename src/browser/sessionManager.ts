import type { Browser, Page } from 'playwright';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

/** A live browser login held in worker memory between the start-login and OTP steps. */
export interface LiveSession {
  sessionId: string;
  clientId: string;
  provider: string;
  browser: Browser | null;
  page: Page;
  timer: NodeJS.Timeout;
}

/** At most this many browsers open at once (each is a real Chrome; the worker is small). */
const MAX_LIVE_SESSIONS = 3;

type ExpiryHandler = (session: LiveSession) => void;

/**
 * Holds the live Playwright pages that outlive a single job: a fetch starts the
 * login (page reaches the OTP screen) in one job and submits the OTP in a later
 * job, and the page must survive in between. In-memory and worker-local by
 * design — a worker restart drops these, and the boot sweep marks the orphaned
 * DB rows expired.
 */
class SessionManager {
  private readonly sessions = new Map<string, LiveSession>();
  private onExpiry: ExpiryHandler | null = null;

  /** Registers the callback run when a session's OTP wait times out (wired by the runner). */
  setExpiryHandler(handler: ExpiryHandler): void {
    this.onExpiry = handler;
  }

  atCapacity(): boolean {
    return this.sessions.size >= MAX_LIVE_SESSIONS;
  }

  /** Stores a freshly-logged-in session and arms its OTP-wait TTL. */
  put(args: { sessionId: string; clientId: string; provider: string; browser: Browser | null; page: Page }): void {
    this.discard(args.sessionId); // replace any prior page for this session
    const timer = setTimeout(() => this.expire(args.sessionId), env.TAX_FETCH_SESSION_TTL_MS);
    this.sessions.set(args.sessionId, { ...args, timer });
  }

  /** Removes and returns a session to act on (clears its TTL). Null if it's gone. */
  take(sessionId: string): LiveSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    clearTimeout(session.timer);
    this.sessions.delete(sessionId);
    return session;
  }

  /** Drops a session and closes its browser without firing the expiry handler. */
  discard(sessionId: string): void {
    const session = this.take(sessionId);
    if (session) void closeBrowser(session.browser);
  }

  private expire(sessionId: string): void {
    const session = this.take(sessionId);
    if (!session) return;
    void closeBrowser(session.browser);
    logger.info('tax fetch: session expired waiting for OTP', { sessionId, clientId: session.clientId });
    this.onExpiry?.(session);
  }
}

async function closeBrowser(browser: Browser | null): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch (err) {
    logger.warn('tax fetch: browser close failed', { reason: String(err) });
  }
}

export const sessionManager = new SessionManager();
