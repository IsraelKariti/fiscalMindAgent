import { z } from 'zod';
import { env } from '../../../config/env.js';
import { RUNNER_PROTOCOL_VERSION } from '../../../browserRunner/protocol.js';
import { logger } from '../../../util/logger.js';
import { provisionSessionContainer, resolveSessionBaseUrl, teardownSessionContainer } from './aciSessionPool.js';
import { fallbackShotItem, storeSessionEvidence, type StoredEvidenceItem } from './stepEvidence.js';
import type { StepRecord } from '../../../browserRunner/stepEvidence.js';
import {
  FetchAtCapacityError,
  NO_DOCUMENTS_ERROR_PREFIX,
  NoDocumentsOnSiteError,
  OtpRejectedError,
  RunnerStepError,
  SessionGoneError,
  sanitizeFilename,
  type FetchedDocument,
  type PortalCredentials,
} from './types.js';

/**
 * How the worker performs a document-fetch, without ever touching a browser. The
 * real implementation talks HTTP to the browser-runner sidecar
 * (src/browserRunner.ts), which holds no platform secrets; the mock stays fully
 * in-process (DOCUMENT_FETCH_MOCK=true — no runner needed).
 */
export interface DocumentFetchClient {
  /** Launches the login; on return the remote page sits on the OTP screen. */
  startLogin(sessionId: string, provider: string, credentials: PortalCredentials): Promise<void>;
  /** Submits the OTP. Throws OtpRejectedError (retryable) or SessionGoneError. */
  submitOtp(sessionId: string, otp: string): Promise<void>;
  /** Downloads the agreed document types (documentKeys); the remote session is closed afterwards either way. */
  downloadDocuments(sessionId: string, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]>;
  /** Closes the remote session. Idempotent, never throws. */
  close(sessionId: string): Promise<void>;
}

// The runner's response crosses a trust boundary (its content originates on the
// external site) — cap and allowlist before the bytes reach blob storage.
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const MAX_FAILURE_SHOT_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENTS_PER_FETCH = 20;
const MAX_EMPLOYER_NAME_CHARS = 200;
const MAX_TITLE_CHARS = 200;
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf']);

// Step evidence (openspec `fetch-step-evidence`): the runner's list answer.
// Each record is bounded like everything else that crosses the runner boundary.
const MAX_EVIDENCE_ITEMS_PER_PULL = 50;
const MAX_EVIDENCE_PART_BYTES = 24 * 1024 * 1024;
const EvidenceListResponse = z.object({
  items: z
    .array(
      z.object({
        seq: z.number().int().positive(),
        name: z.string().min(1).max(120),
        at: z.string().max(40),
        url: z.string().max(2_000).nullable(),
        title: z.string().max(500).nullable(),
        frames: z.array(z.string().max(2_000)).max(100),
        console: z.array(z.object({ at: z.string().max(40), type: z.string().max(40), text: z.string().max(2_000) })).max(200),
        responses: z
          .array(
            z.object({
              at: z.string().max(40),
              method: z.string().max(20),
              url: z.string().max(2_000),
              status: z.number().int().nullable(),
              failure: z.string().max(500).nullable(),
            }),
          )
          .max(200),
        // An older runner may send a longer error (Playwright call logs); keep the head rather than reject the list.
        error: z
          .string()
          .max(64_000)
          .transform((s) => s.slice(0, 4_000))
          .nullable(),
        missing: z.record(z.string().max(500)).default({}),
        sizes: z.record(z.number().int().nonnegative()).default({}),
        // The session's route (openspec `fetch-egress-proxy`), on the first record only.
        egress: z
          .union([z.object({ mode: z.literal('direct') }), z.object({ mode: z.literal('proxy'), host: z.string().min(1).max(300) })])
          .optional(),
      }),
    )
    .max(MAX_EVIDENCE_ITEMS_PER_PULL),
});

/** Where pulled evidence goes; the default stores it under the session's blob prefix. Injectable for tests. */
export type EvidenceSink = (sessionId: string, item: StoredEvidenceItem) => Promise<boolean>;

const DownloadResponse = z.object({
  documents: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(1),
        dataBase64: z.string().min(1),
        employerName: z.string().max(MAX_EMPLOYER_NAME_CHARS).nullish(),
        title: z.string().max(MAX_TITLE_CHARS).nullish(),
        // Provider-defined vocabulary; the runner's response crosses a trust
        // boundary, so only shape is enforced here — meaning is the delivery
        // spec's problem (an unknown kind just gets default handling).
        kind: z.string().min(1).max(50).nullish(),
      }),
    )
    .min(1)
    .max(MAX_DOCUMENTS_PER_FETCH),
});

/**
 * Refuses to drive a runner built from a different contract version (the
 * worker and runner image deploy separately, so they can drift — a stale
 * image broke every prod fetch on 2026-08-01 with an opaque 400). An
 * unreachable or malformed /healthz is NOT treated as a mismatch: the login
 * call right after will fail with the real transport error instead.
 */
async function assertRunnerProtocol(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  let version: unknown;
  try {
    const res = await fetchImpl(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(5000) });
    version = ((await res.json()) as { protocolVersion?: unknown }).protocolVersion;
  } catch {
    return;
  }
  if (version !== RUNNER_PROTOCOL_VERSION) {
    throw new Error(
      `browser runner speaks protocol ${typeof version === 'number' ? version : 'pre-versioning'}, ` +
        `worker expects ${RUNNER_PROTOCOL_VERSION} — rebuild the fiscalmind-browser image from this commit ` +
        `and update DOCUMENT_FETCH_ACI_IMAGE (deploy.yml does this on prod deploys)`,
    );
  }
}

export class HttpDocumentFetchClient implements DocumentFetchClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sink: EvidenceSink;
  private readonly token: () => string | undefined;
  /** session id → highest evidence seq already stored (the runner releases up to it on the next pull). */
  private readonly pulled = new Map<string, number>();

  /** Maps a session to its runner's base URL — a fixed sidecar in static mode, that session's own container in aci mode. */
  constructor(
    private readonly baseUrlFor: (sessionId: string) => string | Promise<string>,
    opts: { fetchImpl?: typeof fetch; evidenceSink?: EvidenceSink; token?: () => string | undefined } = {},
  ) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sink = opts.evidenceSink ?? storeSessionEvidence;
    this.token = opts.token ?? (() => env.BROWSER_RUNNER_TOKEN);
  }

  private async request(sessionId: string, path: string, init: { method: string; body?: unknown }): Promise<globalThis.Response> {
    const token = this.token();
    if (!token) {
      throw new Error('BROWSER_RUNNER_TOKEN is not set — cannot reach the browser runner for a real fetch');
    }
    return this.fetchImpl(`${await this.baseUrlFor(sessionId)}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }

  /**
   * Pulls the step evidence recorded since the previous pull and stores it.
   * Runs after every step, on success and failure alike, before any teardown
   * — and never throws: evidence must never change a fetch's outcome.
   */
  async pullEvidence(sessionId: string): Promise<number> {
    let stored = 0;
    try {
      const after = this.pulled.get(sessionId) ?? 0;
      const res = await this.request(sessionId, `/sessions/${encodeURIComponent(sessionId)}/evidence?after=${after}`, { method: 'GET' });
      if (res.status === 404) return 0;
      if (!res.ok) throw new Error(`runner answered ${res.status} to the evidence list`);
      const parsed = EvidenceListResponse.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new Error('malformed evidence list');
      for (const record of parsed.data.items) {
        const item: StoredEvidenceItem = { record: record as StepRecord };
        for (const part of ['screenshot', 'html', 'mhtml'] as const) {
          if (!(part in record.sizes)) continue;
          const bytes = await this.fetchPart(sessionId, record.seq, part);
          if (bytes) item[part] = bytes;
          else record.missing[part] = record.missing[part] ?? 'the part could not be pulled from the runner';
        }
        if (await this.sink(sessionId, item)) stored += 1;
        this.pulled.set(sessionId, Math.max(this.pulled.get(sessionId) ?? 0, record.seq));
      }
    } catch (err) {
      logger.warn('document fetch: evidence pull failed', { sessionId, reason: String(err) });
    }
    return stored;
  }

  private async fetchPart(sessionId: string, seq: number, part: 'screenshot' | 'html' | 'mhtml'): Promise<Buffer | null> {
    try {
      const res = await this.request(sessionId, `/sessions/${encodeURIComponent(sessionId)}/evidence/${seq}/${part}`, { method: 'GET' });
      if (!res.ok) return null;
      const length = Number(res.headers.get('content-length') ?? 0);
      if (length > MAX_EVIDENCE_PART_BYTES) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      return bytes.length === 0 || bytes.length > MAX_EVIDENCE_PART_BYTES ? null : bytes;
    } catch (err) {
      logger.warn('document fetch: evidence part pull failed', { sessionId, seq, part, reason: String(err) });
      return null;
    }
  }

  /**
   * After a step: pull its evidence, and when the pull produced nothing at all
   * for this session, keep the 502 body's screenshot as a fallback item.
   */
  private async afterStep(sessionId: string, stage: string, err: unknown = null): Promise<void> {
    const stored = await this.pullEvidence(sessionId);
    // The fallback is for a failed step whose own items did not arrive — also
    // when earlier pulls of this session worked (prod session 462d4fe0: the
    // otp-failed list was rejected and its screenshot was lost).
    if (err === null || stored > 0) return;
    const fallback = fallbackShotItem(stage, err);
    if (fallback) await this.sink(sessionId, fallback);
  }

  /** Forgets a session's pull bookkeeping once it is over. */
  forget(sessionId: string): void {
    this.pulled.delete(sessionId);
  }

  private async errorFrom(res: globalThis.Response): Promise<Error> {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; code?: string; screenshotBase64?: string }
      | null;
    // The screenshot crosses the same trust boundary as documents — bound the
    // base64 length before decoding a byte.
    const screenshot =
      typeof body?.screenshotBase64 === 'string' && body.screenshotBase64.length <= (MAX_FAILURE_SHOT_BYTES * 4) / 3 + 4
        ? Buffer.from(body.screenshotBase64, 'base64')
        : null;
    const message = `browser runner responded ${res.status}: ${body?.error ?? 'unknown error'}`;
    if (body?.code === 'no_documents') {
      return new NoDocumentsOnSiteError(`${NO_DOCUMENTS_ERROR_PREFIX}: ${message}`, screenshot);
    }
    return new RunnerStepError(message, screenshot);
  }

  async startLogin(sessionId: string, provider: string, credentials: PortalCredentials): Promise<void> {
    await assertRunnerProtocol(await this.baseUrlFor(sessionId), this.fetchImpl);
    this.pulled.delete(sessionId);
    const res = await this.request(sessionId, '/sessions', {
      method: 'POST',
      body: { sessionId, provider, credentials },
    });
    if (res.status === 201) {
      await this.afterStep(sessionId, 'login');
      return;
    }
    if (res.status === 409) throw new FetchAtCapacityError();
    const err = await this.errorFrom(res);
    await this.afterStep(sessionId, 'login', err);
    throw err;
  }

  async submitOtp(sessionId: string, otp: string): Promise<void> {
    const res = await this.request(sessionId, `/sessions/${encodeURIComponent(sessionId)}/otp`, { method: 'POST', body: { otp } });
    if (res.status === 204) {
      await this.afterStep(sessionId, 'otp');
      return;
    }
    if (res.status === 422) {
      await this.afterStep(sessionId, 'otp');
      throw new OtpRejectedError();
    }
    if (res.status === 410 || res.status === 404) throw new SessionGoneError();
    const err = await this.errorFrom(res);
    await this.afterStep(sessionId, 'otp', err);
    throw err;
  }

  async downloadDocuments(sessionId: string, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    const res = await this.request(sessionId, `/sessions/${encodeURIComponent(sessionId)}/download`, {
      method: 'POST',
      body: { taxYear: opts.taxYear, documentKeys: opts.documentKeys },
    });
    if (res.status === 410 || res.status === 404) throw new SessionGoneError();
    if (!res.ok) {
      const err = await this.errorFrom(res);
      await this.afterStep(sessionId, 'download', err);
      throw err;
    }
    // The runner has closed the browser but still holds the evidence until pulled.
    await this.afterStep(sessionId, 'download');

    const parsed = DownloadResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new Error('browser runner returned a malformed download response');
    return parsed.data.documents.map(({ filename, contentType, dataBase64, employerName, title, kind }) => {
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        throw new Error(`browser runner returned a disallowed content type: ${contentType}`);
      }
      // Base64 length bound first so a huge payload is rejected before decoding.
      if (dataBase64.length > (MAX_DOWNLOAD_BYTES * 4) / 3 + 4) {
        throw new Error('browser runner returned a document larger than the allowed maximum');
      }
      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_DOWNLOAD_BYTES) {
        throw new Error('browser runner returned an empty or oversized document');
      }
      // These names originate on the external site: keep them plain text, one line.
      const oneLine = (text: string | null | undefined): string | null =>
        text?.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ').trim() || null;
      return {
        buffer,
        filename: sanitizeFilename(filename),
        contentType,
        employerName: oneLine(employerName),
        title: oneLine(title),
        kind: kind ?? null,
      };
    });
  }

  async close(sessionId: string): Promise<void> {
    try {
      await this.request(sessionId, `/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    } catch (err) {
      logger.warn('document fetch: closing runner session failed', { sessionId, reason: String(err) });
    }
    this.forget(sessionId);
  }
}

/**
 * Container-per-session client (DOCUMENT_FETCH_RUNNER_MODE=aci): provisions an
 * Azure Container Instance in the Israel egress subnet for each session and
 * deletes it when the session ends, so capacity scales per fetch and the tax
 * authority always sees the verified Israeli NAT IP. The in-session HTTP
 * protocol is identical to the static runner's.
 */
class AciDocumentFetchClient implements DocumentFetchClient {
  private readonly http = new HttpDocumentFetchClient(async (sessionId) => {
    const base = await resolveSessionBaseUrl(sessionId);
    if (!base) throw new SessionGoneError();
    return base;
  });

  async startLogin(sessionId: string, provider: string, credentials: PortalCredentials): Promise<void> {
    await provisionSessionContainer(sessionId); // FetchAtCapacityError on ACI quota
    try {
      await this.http.startLogin(sessionId, provider, credentials);
    } catch (err) {
      await teardownSessionContainer(sessionId);
      throw err;
    }
  }

  async submitOtp(sessionId: string, otp: string): Promise<void> {
    await this.http.submitOtp(sessionId, otp);
  }

  // The HTTP client pulls each step's evidence before returning or throwing,
  // so by the time a container is torn down here its evidence is in storage.
  async downloadDocuments(sessionId: string, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    try {
      return await this.http.downloadDocuments(sessionId, opts);
    } finally {
      await teardownSessionContainer(sessionId);
    }
  }

  // No runner DELETE call: the whole container goes away with the session.
  async close(sessionId: string): Promise<void> {
    await teardownSessionContainer(sessionId);
    this.http.forget(sessionId);
  }
}

// A 1×1 transparent PNG — the mock's "screenshot", so the gallery has a picture to show.
const MOCK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** The mock's synthetic step evidence: two steps per session, through the same store as a real pull. */
async function storeMockEvidence(sessionId: string, provider: string): Promise<void> {
  const steps = [
    { name: `${provider}-01-login-page`, title: 'Mock login', console: [{ at: new Date().toISOString(), type: 'log', text: 'mock page loaded' }] },
    { name: `${provider}-02-credentials-filled`, title: 'Mock login (filled)', console: [] },
  ];
  for (const [i, step] of steps.entries()) {
    const record: StepRecord = {
      seq: i + 1,
      name: step.name,
      at: new Date().toISOString(),
      url: `https://mock.example/${provider}/login`,
      title: step.title,
      frames: [`https://mock.example/${provider}/login`],
      console: step.console,
      responses: i === 1 ? [{ at: new Date().toISOString(), method: 'GET', url: `https://mock.example/${provider}/missing.js`, status: 404, failure: null }] : [],
      error: null,
      missing: { mhtml: 'the mock records no snapshot' },
      sizes: { screenshot: MOCK_PNG.length },
    };
    const html = Buffer.from(`<!doctype html><html lang="he" dir="rtl"><head><title>${step.title}</title></head><body><h1>${step.title}</h1><p>mock evidence for session ${sessionId}</p></body></html>`, 'utf8');
    record.sizes['html'] = html.length;
    await storeSessionEvidence(sessionId, { record, screenshot: MOCK_PNG, html });
  }
}

// A minimal but valid single-page PDF, so delivery (blob upload, WhatsApp media)
// exercises a real file without touching the tax authority.
const MOCK_PDF = Buffer.from(
  '255044462d312e340a25c7ec8f0a312030206f626a0a3c3c2f547970652f436174616c6f672f50616765732032203020523e3e0a656e646f626a0a322030206f626a0a3c3c2f547970652f50616765732f4b6964735b33203020525d2f436f756e7420313e3e0a656e646f626a0a332030206f626a0a3c3c2f547970652f506167652f506172656e742032203020522f4d65646961426f785b30203020323030203230305d3e3e0a656e646f626a0a787265660a3020340a303030303030303030302036353533352066200a30303030303030303039203030303030206e200a30303030303030303538203030303030206e200a30303030303030313135203030303030206e200a747261696c65720a3c3c2f526f6f742031203020522f53697a6520343e3e0a7374617274787265660a3138320a2525454f46',
  'hex',
);

/**
 * No-browser, no-runner stand-in for iterating on the whole flow without
 * emailing a real citizen an OTP. Enabled by DOCUMENT_FETCH_MOCK=true. Accepts any 6-digit
 * OTP; anything else is rejected like a wrong code so the retry path can be
 * tested.
 */
class MockDocumentFetchClient implements DocumentFetchClient {
  /** session id → provider, so downloads can mirror each provider's real document shape. */
  private readonly live = new Map<string, string>();

  async startLogin(sessionId: string, provider: string): Promise<void> {
    await sleep(2000);
    this.live.set(sessionId, provider);
    await storeMockEvidence(sessionId, provider);
  }

  async submitOtp(sessionId: string, otp: string): Promise<void> {
    if (!this.live.has(sessionId)) throw new SessionGoneError();
    await sleep(500);
    if (!/^\d{6}$/.test(otp.trim())) throw new OtpRejectedError();
  }

  async downloadDocuments(sessionId: string, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    const provider = this.live.get(sessionId);
    if (!provider) throw new SessionGoneError();
    await sleep(500);
    this.live.delete(sessionId);
    // Harel: two filter rounds in one login (openspec `harel-fetch`); a client
    // can hold several study funds, all the same document kind told apart only
    // by their on-site titles — return two study-fund files and one pension
    // file per agreed key so the multi-fund delivery path (labels, plural
    // texts, row creation for a kind the list lacks) is exercised without the site.
    if (provider === 'harel') {
      const titlesByKey: Record<string, string[]> = {
        study_fund_annual: ['דוח שנתי קרן השתלמות מסלול כללי', 'דוח שנתי קרן השתלמות מסלול מניות'],
        pension_annual: ['דוח שנתי קרן פנסיה מקיפה — חשבון 12345'],
      };
      return opts.documentKeys
        .filter((key) => key in titlesByKey)
        .flatMap((key) => titlesByKey[key]!.map((title) => ({ key, title })))
        .map((d, i) => ({
          buffer: MOCK_PDF,
          filename: `mock_harel_${d.key}_${opts.taxYear}_${i + 1}.pdf`,
          contentType: 'application/pdf',
          employerName: null,
          title: d.title,
          kind: d.key,
        }));
    }
    // Phoenix: the list walk takes every annual row for the year, and a client
    // usually has two per product (full report + short report with the tax
    // certificate) — return both per agreed key, titled like the site names
    // them, so plural labels and texts are exercised.
    if (provider === 'phoenix') {
      const titlesByKey: Record<string, string[]> = {
        pension_annual: [`דוח מפורט לשנת ${opts.taxYear}`, `דוח מקוצר לשנת ${opts.taxYear}`],
        study_fund_annual: [`דוח שנתי מלא ${opts.taxYear}`, `דוח שנתי מקוצר ואישור מס ${opts.taxYear}`],
      };
      return opts.documentKeys
        .filter((key) => key in titlesByKey)
        .flatMap((key) => titlesByKey[key]!.map((title) => ({ key, title })))
        .map((d, i) => ({
          buffer: MOCK_PDF,
          filename: `mock_phoenix_${opts.taxYear}_${i + 1}.pdf`,
          contentType: 'application/pdf',
          employerName: null,
          title: d.title,
          kind: d.key,
        }));
    }
    // Menora's reports filter (openspec `menora-fetch`) lists one short annual
    // report per product, titled "<type> <year> — <product>" as the row reads;
    // the pension title is the owner's real row, the study-fund product name
    // comes from the dashboard card.
    if (provider === 'menora_mivtachim') {
      const titlesByKey: Record<string, string> = {
        pension_annual: `דוח שנתי מקוצר ${opts.taxYear} — מנורה מבטחים פנסיה מקיפה`,
        study_fund_annual: `דוח שנתי מקוצר ${opts.taxYear} — מנורה מבטחים השתלמות`,
      };
      return opts.documentKeys
        .filter((key) => key in titlesByKey)
        .map((key, i) => ({
          buffer: MOCK_PDF,
          filename: `mock_menora_${opts.taxYear}_${i + 1}.pdf`,
          contentType: 'application/pdf',
          employerName: null,
          title: titlesByKey[key]!,
          kind: key,
        }));
    }
    // Meitav's periodic-reports page (openspec `meitav-fetch`) lists per
    // product the detailed and the short annual report of the year, both of
    // the product's kind; the titles are the site's real ones (the same for
    // every product).
    if (provider === 'meitav') {
      const titles = [`דוח שנתי מפורט דצמבר ${opts.taxYear}`, `דוח שנתי מקוצר דצמבר ${opts.taxYear}`];
      return opts.documentKeys
        .filter((key) => key === 'pension_annual' || key === 'study_fund_annual')
        .flatMap((key) => titles.map((title) => ({ key, title })))
        .map((d, i) => ({
          buffer: MOCK_PDF,
          filename: `mock_meitav_${opts.taxYear}_${i + 1}.pdf`,
          contentType: 'application/pdf',
          employerName: null,
          title: d.title,
          kind: d.key,
        }));
    }
    // Migdal's four rounds (openspec `migdal-fetch`) yield the full and the
    // short annual report per product, both of the product's kind, titled the
    // way the site names its rows (the pension titles are the owner's real
    // ones; the study-fund titles are invented for the mock).
    if (provider === 'migdal') {
      const titlesByKey: Record<string, string[]> = {
        pension_annual: [
          `דוח שנתי לעמית- מקפת אישית - לשנת ${opts.taxYear}`,
          `דוח שנתי מקוצר לעמית -מקפת אישית - לשנת ${opts.taxYear}`,
        ],
        study_fund_annual: [
          `דוח שנתי לעמית - קרן השתלמות - לשנת ${opts.taxYear}`,
          `דוח שנתי מקוצר לעמית - קרן השתלמות - לשנת ${opts.taxYear}`,
        ],
      };
      return opts.documentKeys
        .filter((key) => key in titlesByKey)
        .flatMap((key) => titlesByKey[key]!.map((title) => ({ key, title })))
        .map((d, i) => ({
          buffer: MOCK_PDF,
          filename: `mock_migdal_${opts.taxYear}_${i + 1}.pdf`,
          contentType: 'application/pdf',
          employerName: null,
          title: d.title,
          kind: d.key,
        }));
    }
    // Provider-aware via the agreed keys: any non-106 key set (e.g. Altshuler's
    // pension/study fund) returns one PDF per requested key, so the multi-document
    // delivery path is exercised with the right kinds and labels.
    const keys = opts.documentKeys.filter((k) => k !== 'form106');
    if (keys.length > 0) {
      return keys.map((key) => ({
        buffer: MOCK_PDF,
        filename: `mock_${key}_${opts.taxYear}.pdf`,
        contentType: 'application/pdf',
        employerName: null,
        kind: key,
      }));
    }
    // Tax authority default: two employers plus the all-employers salary summary,
    // like a real multi-employer year, so the whole delivery path (multiple
    // blobs, labels, plural texts) is exercised without the site.
    return [
      {
        buffer: MOCK_PDF,
        filename: `salary_summary_${opts.taxYear}.pdf`,
        contentType: 'application/pdf',
        employerName: null,
        kind: 'salary_summary',
      },
      {
        buffer: MOCK_PDF,
        filename: `form_106_${opts.taxYear}_936440585.pdf`,
        contentType: 'application/pdf',
        employerName: 'מעסיק לדוגמה בע"מ',
        kind: 'form106',
      },
      {
        buffer: MOCK_PDF,
        filename: `form_106_${opts.taxYear}_936480938.pdf`,
        contentType: 'application/pdf',
        employerName: 'חברת דמו בע"מ',
        kind: 'form106',
      },
    ];
  }

  async close(sessionId: string): Promise<void> {
    this.live.delete(sessionId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const staticClient = new HttpDocumentFetchClient(() => env.BROWSER_RUNNER_URL);
const aciClient = new AciDocumentFetchClient();
const mockClient = new MockDocumentFetchClient();

export function getFetchClient(): DocumentFetchClient {
  if (env.DOCUMENT_FETCH_MOCK) return mockClient;
  return env.DOCUMENT_FETCH_RUNNER_MODE === 'aci' ? aciClient : staticClient;
}
