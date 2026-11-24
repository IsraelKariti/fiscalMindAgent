import { createHash, timingSafeEqual } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Browser, Page } from 'playwright';
import { z } from 'zod';
import { runnerEnv } from './env.js';
import { attachCollector, collectorOf, debugShot, launchInteractivePage, type LaunchedSession } from './launch.js';
import { type EvidencePart, type StepCollector } from './stepEvidence.js';
import { israelTaxAuthorityProvider } from './israelTaxAuthority.js';
import { altshulerShahamProvider } from './altshulerShaham.js';
import { harelProvider } from './harel.js';
import { phoenixProvider } from './phoenix.js';
import { migdalProvider } from './migdal.js';
import { meitavProvider } from './meitav.js';
import { menoraProvider } from './menora.js';
import { NoDocumentsOnSiteError, OtpRejectedError, type DocumentFetchProvider } from './providerTypes.js';
import { RUNNER_PROTOCOL_VERSION } from './protocol.js';
import { logger } from '../util/logger.js';

const PROVIDERS: Record<string, DocumentFetchProvider> = {
  israel_tax_authority: israelTaxAuthorityProvider,
  altshuler_shaham: altshulerShahamProvider,
  harel: harelProvider,
  phoenix: phoenixProvider,
  migdal: migdalProvider,
  meitav: meitavProvider,
  menora_mivtachim: menoraProvider,
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

/**
 * Step evidence per session (openspec `fetch-step-evidence`), kept apart from
 * the live browsers: it must outlive closeSession() — a failed login closes
 * the browser before the worker can pull — and go away only when reaped.
 */
interface SessionEvidence {
  collector: StepCollector;
  timer: NodeJS.Timeout;
}
const evidence = new Map<string, SessionEvidence>();

function touchEvidence(sessionId: string, collector: StepCollector): void {
  const prior = evidence.get(sessionId);
  if (prior) clearTimeout(prior.timer);
  const timer = setTimeout(() => {
    evidence.delete(sessionId);
    logger.info('browser runner: evidence of a finished session released', { sessionId });
  }, runnerEnv.TAX_FETCH_SESSION_TTL_MS + BACKSTOP_GRACE_MS);
  timer.unref?.();
  evidence.set(sessionId, { collector, timer });
}

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
  // Provider-keyed login values (e.g. idNumber/userCode, idNumber/phoneNumber);
  // each provider validates its own required keys. Bounded so the body can't
  // smuggle arbitrary bulk.
  credentials: z
    .record(z.string().min(1).max(40), z.string().min(1).max(200))
    .refine((map) => Object.keys(map).length >= 1 && Object.keys(map).length <= 8, {
      message: 'credentials must hold between 1 and 8 entries',
    }),
});
const OtpBody = z.object({ otp: z.string().min(1).max(20) });
const DownloadBody = z.object({
  taxYear: z.number().int().min(2000).max(2100),
  documentKeys: z.array(z.string().min(1).max(50)).max(10).optional(),
});

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// Failure screenshots larger than this are dropped rather than bloating the
// error response (the worker caps what it accepts too).
const MAX_FAILURE_SHOT_BYTES = 8 * 1024 * 1024;

/**
 * What the page looked like when a step failed, for the 502 body. Kept as a
 * fallback for a worker whose evidence pull fails; the same screenshot is
 * also the last step-evidence item (failureBody records it). Best-effort.
 */
async function captureFailureShot(page: Page | null): Promise<string | undefined> {
  if (!page) return undefined;
  try {
    const shot = await page.screenshot({ fullPage: true, timeout: 10_000 });
    if (shot.length > MAX_FAILURE_SHOT_BYTES) return undefined;
    return shot.toString('base64');
  } catch {
    return undefined;
  }
}

/**
 * The 502 error body for a failed step: message, machine-readable code,
 * evidence screenshot. The moment of failure is first recorded as one more
 * step-evidence item named `<stage>-failed`, so the gallery ends with it.
 */
async function failureBody(err: unknown, page: Page | null, stage: string): Promise<Record<string, unknown>> {
  if (page) await debugShot(page, `${stage}-failed`, errText(err));
  return {
    error: errText(err),
    ...(err instanceof NoDocumentsOnSiteError ? { code: 'no_documents' } : {}),
    ...(await captureFailureShot(page).then((shot) => (shot ? { screenshotBase64: shot } : {}))),
  };
}

const EVIDENCE_PARTS: Record<EvidencePart, string> = {
  screenshot: 'image/png',
  html: 'text/html; charset=utf-8',
  mhtml: 'multipart/related',
};

/** Injectable for tests: the providers and the browser launcher. */
export interface RunnerAppDeps {
  providers?: Record<string, DocumentFetchProvider>;
  launch?: () => Promise<LaunchedSession>;
}

export function createRunnerApp(deps: RunnerAppDeps = {}): Express {
  const providers = deps.providers ?? PROVIDERS;
  const launch = deps.launch ?? launchInteractivePage;
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  // Auth-free so container health probes can hit it; reveals only liveness
  // and the contract version the worker checks before starting a login.
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, liveSessions: sessions.size, protocolVersion: RUNNER_PROTOCOL_VERSION });
  });

  app.use(buildAuthMiddleware());

  // Launches Chrome and submits the login form, leaving the page on the OTP
  // screen (this is what triggers the site's OTP email to the client).
  app.post('/sessions', async (req, res) => {
    const parsed = StartLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid body' });
      return;
    }
    const { sessionId, provider: providerId, credentials } = parsed.data;
    const provider = providers[providerId];
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
    let page: Page | null = null;
    try {
      const launched = await launch();
      browser = launched.browser;
      page = launched.page;
      // Evidence is registered before the first step so a failed login still leaves its items.
      touchEvidence(sessionId, collectorOf(page) ?? attachCollector(page));
      await provider.startLogin(launched.page, credentials);
      sessions.set(sessionId, { browser, page: launched.page, providerId, timer: armBackstop(sessionId) });
      res.status(201).json({ ok: true });
    } catch (err) {
      logger.error('browser runner: start login failed', err, { sessionId });
      const body = await failureBody(err, page, 'login');
      if (browser) await browser.close().catch(() => undefined);
      res.status(502).json(body);
    }
  });

  // Step evidence recorded since `after` (metadata only; bytes per part below).
  // Asking with `after=N` confirms the worker stored everything up to N, which
  // releases those items from memory.
  app.get('/sessions/:id/evidence', (req, res) => {
    const entry = evidence.get(req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'no evidence' });
      return;
    }
    const after = Number.parseInt(String(req.query['after'] ?? '0'), 10);
    if (Number.isFinite(after) && after > 0) entry.collector.release(after);
    touchEvidence(req.params.id, entry.collector);
    res.json({ items: entry.collector.listAfter(Number.isFinite(after) ? after : 0).map((item) => item.record) });
  });

  app.get('/sessions/:id/evidence/:seq/:part', (req, res) => {
    const entry = evidence.get(req.params.id);
    const seq = Number.parseInt(req.params.seq, 10);
    const part = req.params.part as EvidencePart;
    const item = entry && Number.isFinite(seq) ? entry.collector.get(seq) : undefined;
    const bytes = item && part in EVIDENCE_PARTS ? item[part] : null;
    if (!bytes) {
      res.status(404).json({ error: 'no such evidence part' });
      return;
    }
    res.setHeader('Content-Type', EVIDENCE_PARTS[part]);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
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
      await providers[session.providerId]!.submitOtp(session.page, parsed.data.otp);
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
      const body = await failureBody(err, session.page, 'otp');
      await closeSession(sessionId);
      res.status(502).json(body);
    }
  });

  // Downloads all matching documents (one per employer for Form 106). The
  // session is closed afterwards either way — a fetch is single-use and no
  // browser may linger.
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
      const docs = await providers[session.providerId]!.downloadDocuments(session.page, {
        taxYear: parsed.data.taxYear,
        documentKeys: parsed.data.documentKeys ?? [],
      });
      res.json({
        documents: docs.map((doc) => ({
          filename: doc.filename,
          contentType: doc.contentType,
          dataBase64: doc.buffer.toString('base64'),
          employerName: doc.employerName ?? null,
          title: doc.title ?? null,
          kind: doc.kind ?? null,
        })),
      });
    } catch (err) {
      logger.error('browser runner: download failed', err, { sessionId });
      res.status(502).json(await failureBody(err, session.page, 'download'));
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

/** Shutdown hook: close every live browser and drop held evidence. */
export async function closeAllSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((id) => closeSession(id)));
  for (const [id, entry] of evidence) {
    clearTimeout(entry.timer);
    evidence.delete(id);
  }
}
