import { z } from 'zod';
import { env } from '../../../config/env.js';
import { logger } from '../../../util/logger.js';
import {
  FetchAtCapacityError,
  OtpRejectedError,
  SessionGoneError,
  sanitizeFilename,
  type FetchedDocument,
  type PortalLoginCredentials,
} from './types.js';

/**
 * How the worker performs a tax-fetch, without ever touching a browser. The
 * real implementation talks HTTP to the browser-runner sidecar
 * (src/browserRunner.ts), which holds no platform secrets; the mock stays fully
 * in-process (TAX_FETCH_MOCK=true — no runner needed).
 */
export interface TaxFetchClient {
  /** Launches the login; on return the remote page sits on the OTP screen. */
  startLogin(sessionId: string, provider: string, creds: PortalLoginCredentials): Promise<void>;
  /** Submits the OTP. Throws OtpRejectedError (retryable) or SessionGoneError. */
  submitOtp(sessionId: string, otp: string): Promise<void>;
  /** Downloads the document; the remote session is closed afterwards either way. */
  downloadDocument(sessionId: string, opts: { taxYear: number }): Promise<FetchedDocument>;
  /** Closes the remote session. Idempotent, never throws. */
  close(sessionId: string): Promise<void>;
}

// The runner's response crosses a trust boundary (its content originates on the
// external site) — cap and allowlist before the bytes reach blob storage.
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf']);

const DownloadResponse = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  dataBase64: z.string().min(1),
});

class HttpTaxFetchClient implements TaxFetchClient {
  private request(path: string, init: { method: string; body?: unknown }): Promise<globalThis.Response> {
    if (!env.BROWSER_RUNNER_TOKEN) {
      throw new Error('BROWSER_RUNNER_TOKEN is not set — cannot reach the browser runner for a real fetch');
    }
    return fetch(`${env.BROWSER_RUNNER_URL}${path}`, {
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

  async startLogin(sessionId: string, provider: string, creds: PortalLoginCredentials): Promise<void> {
    const res = await this.request('/sessions', {
      method: 'POST',
      body: { sessionId, provider, idNumber: creds.idNumber, userCode: creds.userCode },
    });
    if (res.status === 201) return;
    if (res.status === 409) throw new FetchAtCapacityError();
    throw await this.errorFrom(res);
  }

  async submitOtp(sessionId: string, otp: string): Promise<void> {
    const res = await this.request(`/sessions/${encodeURIComponent(sessionId)}/otp`, { method: 'POST', body: { otp } });
    if (res.status === 204) return;
    if (res.status === 422) throw new OtpRejectedError();
    if (res.status === 410 || res.status === 404) throw new SessionGoneError();
    throw await this.errorFrom(res);
  }

  async downloadDocument(sessionId: string, opts: { taxYear: number }): Promise<FetchedDocument> {
    const res = await this.request(`/sessions/${encodeURIComponent(sessionId)}/download`, {
      method: 'POST',
      body: { taxYear: opts.taxYear },
    });
    if (res.status === 410 || res.status === 404) throw new SessionGoneError();
    if (!res.ok) throw await this.errorFrom(res);

    const parsed = DownloadResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new Error('browser runner returned a malformed download response');
    const { filename, contentType, dataBase64 } = parsed.data;
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
    return { buffer, filename: sanitizeFilename(filename), contentType };
  }

  async close(sessionId: string): Promise<void> {
    try {
      await this.request(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    } catch (err) {
      logger.warn('tax fetch: closing runner session failed', { sessionId, reason: String(err) });
    }
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
 * SMSing a real citizen. Enabled by TAX_FETCH_MOCK=true. Accepts any 6-digit
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

  async downloadDocument(sessionId: string, opts: { taxYear: number }): Promise<FetchedDocument> {
    if (!this.live.has(sessionId)) throw new SessionGoneError();
    await sleep(500);
    this.live.delete(sessionId);
    return { buffer: MOCK_PDF, filename: `form_106_${opts.taxYear}.pdf`, contentType: 'application/pdf' };
  }

  async close(sessionId: string): Promise<void> {
    this.live.delete(sessionId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const httpClient = new HttpTaxFetchClient();
const mockClient = new MockTaxFetchClient();

export function getFetchClient(): TaxFetchClient {
  return env.TAX_FETCH_MOCK ? mockClient : httpClient;
}
