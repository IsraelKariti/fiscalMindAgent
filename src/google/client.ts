/**
 * Server-side Google REST client (Sheets + Docs), authenticated by a stored
 * per-accountant drive.file OAuth token (google_oauth_tokens) — refreshed by
 * getFreshGoogleAccessToken() before it gets here. Like the monday client,
 * this runs at webhook time with no browser involved.
 */

/** The webhook reply path calls Google inline — a hung call must not hang it. */
const REQUEST_TIMEOUT_MS = 15_000;

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

export async function googleApiGet<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ? `: ${body.error.message}` : '';
    } catch {
      /* non-JSON error body */
    }
    throw new GoogleApiError(`Google API HTTP ${response.status}${detail}`, response.status);
  }
  return (await response.json()) as T;
}
