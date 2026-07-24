import { env } from '../../../config/env.js';

/**
 * Bookkeeping for a fetch in flight, held between the start-login and OTP jobs.
 * Holds NO browser handles and no credentials — the live Chrome lives in the
 * browser-runner sidecar (or the mock client), keyed by the same session id.
 * In-memory and worker-local by design: a worker restart drops these, the boot
 * sweep marks the orphaned DB rows expired, and the runner's backstop TTL reaps
 * the orphaned browsers.
 */
export interface TrackedSession {
  sessionId: string;
  clientId: string;
  provider: string;
  timer: NodeJS.Timeout;
}

/** At most this many fetches in flight at once (each is a real Chrome on the runner). */
const MAX_LIVE_SESSIONS = 3;

type ExpiryHandler = (session: TrackedSession) => void;

class SessionTracker {
  private readonly sessions = new Map<string, TrackedSession>();
  private onExpiry: ExpiryHandler | null = null;

  /** Registers the callback run when a session's OTP wait times out (wired by the runner module). */
  setExpiryHandler(handler: ExpiryHandler): void {
    this.onExpiry = handler;
  }

  atCapacity(): boolean {
    return this.sessions.size >= MAX_LIVE_SESSIONS;
  }

  /** Tracks a freshly-logged-in session and arms its OTP-wait TTL. */
  put(args: { sessionId: string; clientId: string; provider: string }): void {
    this.discard(args.sessionId); // replace any prior entry for this session
    const timer = setTimeout(() => this.expire(args.sessionId), env.TAX_FETCH_SESSION_TTL_MS);
    this.sessions.set(args.sessionId, { ...args, timer });
  }

  /** Removes and returns a session to act on (clears its TTL). Null if it's gone. */
  take(sessionId: string): TrackedSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    clearTimeout(session.timer);
    this.sessions.delete(sessionId);
    return session;
  }

  /** Drops a session without firing the expiry handler. The caller closes the remote side. */
  discard(sessionId: string): void {
    this.take(sessionId);
  }

  private expire(sessionId: string): void {
    const session = this.take(sessionId);
    if (session) this.onExpiry?.(session);
  }
}

export const sessionTracker = new SessionTracker();
