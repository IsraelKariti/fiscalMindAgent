import { createHash, timingSafeEqual } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Browser, Page } from 'playwright';
import { z } from 'zod';
import { runnerEnv } from './env.js';
import { launchInteractivePage } from './launch.js';
import { israelTaxAuthorityProvider } from './israelTaxAuthority.js';
import { OtpRejectedError, type DocumentFetchProvider } from './providerTypes.js';
import { logger } from '../util/logger.js';

const PROVIDERS: Record<string, DocumentFetchProvider> = {
  israel_tax_authority: israelTaxAuthorityProvider,
};

/** At most this many browsers open at once (each is a real Chrome; the box is small). */
const MAX_LIVE_SESSIONS = 3;

// The worker's OTP-wait timer is the primary TTL; this backstop only reaps
// browsers the worker forgot (crash between jobs, lost network).
const BACKSTOP_GRACE_MS = 60_000;

interface RunnerSession {
  browser: Browser;
  page: Page;
  providerId: string;
  timer: NodeJS.Timeout;
}

const sessions = new Map<string, RunnerSession>();

async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  clearTimeout(session.timer);
  try {
    await session.browser.close();
  } catch (err) {
    logger.warn('browser runner: browser close failed', { sessionId, reason: String(err) });
  }
}

function armBackstop(sessionId: string): NodeJS.Timeout {
  return setTimeout(() => {
    logger.info('browser runner: backstop TTL closed orphaned session', { sessionId });
    void closeSession(sessionId);
  }, runnerEnv.TAX_FETCH_SESSION_TTL_MS + BACKSTOP_GRACE_MS);
}

function buildAuthMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
  if (!runnerEnv.BROWSER_RUNNER_TOKEN) {
    throw new Error('BROWSER_RUNNER_TOKEN must be set to start the browser runner');
  }
  // Compare digests, not the raw strings: timingSafeEqual requires equal
  // lengths and hashing avoids leaking the token's length.
  const expectedToken = createHash('sha256').update(runnerEnv.BROWSER_RUNNER_TOKEN).digest();
  return (req, res, next) => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    const presented = match ? createHash('sha256').update(match[1] as string).digest() : null;
    if (!presented || !timingSafeEqual(expectedToken, presented)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
}

const StartLoginBody = z.object({
  sessionId: z.string().min(1).max(200),
  provider: z.string().min(1),
  idNumber: z.string().min(1).max(50),
  userCode: z.string().min(1).max(100),
});
const OtpBody = z.object({ otp: z.string().min(1).max(20) });
const DownloadBody = z.object({ taxYear: z.number().int().min(2000).max(2100) });

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function createRunnerApp(): Express {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  // Auth-free so container health probes can hit it; reveals only liveness.
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, liveSessions: sessions.size });
  });

  app.use(buildAuthMiddleware());

  // Launches Chrome and submits the login form, leaving the page on the OTP
  // screen (this is what triggers the site's OTP SMS to the client).
  app.post('/sessions', async (req, res) => {
    const parsed = StartLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid body' });
      return;
    }
    const { sessionId, provider: providerId, idNumber, userCode } = parsed.data;
    const provider = PROVIDERS[providerId];
    if (!provider) {
      res.status(400).json({ error: `unknown provider: ${providerId}` });
      return;
    }
    if (sessions.size >= MAX_LIVE_SESSIONS) {
      res.status(409).json({ error: 'at_capacity' });
      return;
    }
    await closeSession(sessionId); // replace any prior browser for this id
    let browser: Browser | null = null;
    try {
      const launched = await launchInteractivePage();
      browser = launched.browser;
      await provider.startLogin(launched.page, { idNumber, userCode });
      sessions.set(sessionId, { browser, page: launched.page, providerId, timer: armBackstop(sessionId) });
      res.status(201).json({ ok: true });
    } catch (err) {
      logger.error('browser runner: start login failed', err, { sessionId });
      if (browser) await browser.close().catch(() => undefined);
      res.status(502).json({ error: errText(err) });
    }
  });

  // Types the OTP. 422 keeps the session alive on the OTP screen for a retry;
  // any other failure closes the browser (the page state is unknown).
  app.post('/sessions/:id/otp', async (req, res) => {
    const parsed = OtpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid body' });
      return;
    }
    const sessionId = req.params.id;
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(410).json({ error: 'session gone' });
      return;
    }
    try {
      await PROVIDERS[session.providerId]!.submitOtp(session.page, parsed.data.otp);
      clearTimeout(session.timer);
      session.timer = armBackstop(sessionId);
      res.status(204).end();
    } catch (err) {
      if (err instanceof OtpRejectedError) {
        clearTimeout(session.timer);
        session.timer = armBackstop(sessionId);
        res.status(422).json({ error: 'otp_rejected' });
        return;
      }
      logger.error('browser runner: otp submit failed', err, { sessionId });
      await closeSession(sessionId);
      res.status(502).json({ error: errText(err) });
    }
  });

  // Downloads the document. The session is closed afterwards either way — a
  // fetch is single-use and no browser may linger.
  app.post('/sessions/:id/download', async (req, res) => {
    const parsed = DownloadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid body' });
      return;
    }
    const sessionId = req.params.id;
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(410).json({ error: 'session gone' });
      return;
    }
    try {
      const doc = await PROVIDERS[session.providerId]!.downloadDocument(session.page, { taxYear: parsed.data.taxYear });
      res.json({ filename: doc.filename, contentType: doc.contentType, dataBase64: doc.buffer.toString('base64') });
    } catch (err) {
      logger.error('browser runner: download failed', err, { sessionId });
      res.status(502).json({ error: errText(err) });
    } finally {
      await closeSession(sessionId);
    }
  });

  app.delete('/sessions/:id', async (req, res) => {
    await closeSession(req.params.id);
    res.status(204).end();
  });

  return app;
}

/** Shutdown hook: close every live browser. */
export async function closeAllSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((id) => closeSession(id)));
}
