import { z } from 'zod';
import { env } from '../../../config/env.js';
import { logger } from '../../../util/logger.js';
import { provisionSessionContainer, resolveSessionBaseUrl, teardownSessionContainer } from './aciSessionPool.js';
import {
  FetchAtCapacityError,
  OtpRejectedError,
  SessionGoneError,
  sanitizeFilename,
  type FetchedDocument,
  type PortalCredentials,
} from './types.js';

/**
 * How the worker performs a tax-fetch, without ever touching a browser. The
 * real implementation talks HTTP to the browser-runner sidecar
 * (src/browserRunner.ts), which holds no platform secrets; the mock stays fully
 * in-process (TAX_FETCH_MOCK=true — no runner needed).
 */
export interface TaxFetchClient {
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
const MAX_DOCUMENTS_PER_FETCH = 20;
const MAX_EMPLOYER_NAME_CHARS = 200;
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf']);

const DownloadResponse = z.object({
  documents: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(1),
        dataBase64: z.string().min(1),
        employerName: z.string().max(MAX_EMPLOYER_NAME_CHARS).nullish(),
        // Provider-defined vocabulary; the runner's response crosses a trust
        // boundary, so only shape is enforced here — meaning is the delivery
        // spec's problem (an unknown kind just gets default handling).
        kind: z.string().min(1).max(50).nullish(),
      }),
    )
    .min(1)
    .max(MAX_DOCUMENTS_PER_FETCH),
});

class HttpTaxFetchClient implements TaxFetchClient {
  /** Maps a session to its runner's base URL — a fixed sidecar in static mode, that session's own container in aci mode. */
  constructor(private readonly baseUrlFor: (sessionId: string) => string | Promise<string>) {}

  private async request(sessionId: string, path: string, init: { method: string; body?: unknown }): Promise<globalThis.Response> {
    if (!env.BROWSER_RUNNER_TOKEN) {
      throw new Error('BROWSER_RUNNER_TOKEN is not set — cannot reach the browser runner for a real fetch');
    }
    return fetch(`${await this.baseUrlFor(sessionId)}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${env.BROWSER_RUNNER_TOKEN}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }

  private async errorFrom(res: globalThis.Response): Promise<Error> {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return new Error(`browser runner responded ${res.status}: ${body?.error ?? 'unknown error'}`);
  }

  async startLogin(sessionId: string, provider: string, credentials: PortalCredentials): Promise<void> {
    const res = await this.request(sessionId, '/sessions', {
      method: 'POST',
      body: { sessionId, provider, credentials },
    });
    if (res.status === 201) return;
    if (res.status === 409) throw new FetchAtCapacityError();
    throw await this.errorFrom(res);
  }

  async submitOtp(sessionId: string, otp: string): Promise<void> {
    const res = await this.request(sessionId, `/sessions/${encodeURIComponent(sessionId)}/otp`, { method: 'POST', body: { otp } });
    if (res.status === 204) return;
    if (res.status === 422) throw new OtpRejectedError();
    if (res.status === 410 || res.status === 404) throw new SessionGoneError();
    throw await this.errorFrom(res);
  }

  async downloadDocuments(sessionId: string, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    const res = await this.request(sessionId, `/sessions/${encodeURIComponent(sessionId)}/download`, {
      method: 'POST',
      body: { taxYear: opts.taxYear, documentKeys: opts.documentKeys },
    });
    if (res.status === 410 || res.status === 404) throw new SessionGoneError();
    if (!res.ok) throw await this.errorFrom(res);

    const parsed = DownloadResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new Error('browser runner returned a malformed download response');
    return parsed.data.documents.map(({ filename, contentType, dataBase64, employerName, kind }) => {
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
      // The name originates on the external site: keep it plain text, one line.
      const cleanedEmployer = employerName?.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ').trim() || null;
      return { buffer, filename: sanitizeFilename(filename), contentType, employerName: cleanedEmployer, kind: kind ?? null };
    });
  }

  async close(sessionId: string): Promise<void> {
    try {
      await this.request(sessionId, `/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    } catch (err) {
      logger.warn('tax fetch: closing runner session failed', { sessionId, reason: String(err) });
    }
  }
}

/**
 * Container-per-session client (TAX_FETCH_RUNNER_MODE=aci): provisions an
 * Azure Container Instance in the Israel egress subnet for each session and
 * deletes it when the session ends, so capacity scales per fetch and the tax
 * authority always sees the verified Israeli NAT IP. The in-session HTTP
 * protocol is identical to the static runner's.
 */
class AciTaxFetchClient implements TaxFetchClient {
  private readonly http = new HttpTaxFetchClient(async (sessionId) => {
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
 * emailing a real citizen an OTP. Enabled by TAX_FETCH_MOCK=true. Accepts any 6-digit
 * OTP; anything else is rejected like a wrong code so the retry path can be
 * tested.
 */
class MockTaxFetchClient implements TaxFetchClient {
  private readonly live = new Set<string>();

  async startLogin(sessionId: string): Promise<void> {
    await sleep(2000);
    this.live.add(sessionId);
  }

  async submitOtp(sessionId: string, otp: string): Promise<void> {
    if (!this.live.has(sessionId)) throw new SessionGoneError();
    await sleep(500);
    if (!/^\d{6}$/.test(otp.trim())) throw new OtpRejectedError();
  }

  async downloadDocuments(sessionId: string, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]> {
    if (!this.live.has(sessionId)) throw new SessionGoneError();
    await sleep(500);
    this.live.delete(sessionId);
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

const staticClient = new HttpTaxFetchClient(() => env.BROWSER_RUNNER_URL);
const aciClient = new AciTaxFetchClient();
const mockClient = new MockTaxFetchClient();

export function getFetchClient(): TaxFetchClient {
  if (env.TAX_FETCH_MOCK) return mockClient;
  return env.TAX_FETCH_RUNNER_MODE === 'aci' ? aciClient : staticClient;
}
