import type { AccountTier, DashboardSummary, Me } from '../api';
import { getSessionToken } from './sdk';

/** What the widget may show for this monday user (see POST /api/monday/session). */
export interface MondaySessionStatus {
  provisioned: boolean;
  /** False while the account is auto-provisioned (no Google sign-in linked yet). */
  linked: boolean;
  email: string;
  whitelisted: boolean;
  tier: AccountTier | null;
  mailboxClaimed: boolean;
  /** Base URL of the standalone app, for "open in FiscalMind" links. */
  appUrl: string;
}

export class MondayApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine-readable error code (e.g. 'email_in_use', 'no_mailbox'). */
    public code?: string,
  ) {
    super(message);
  }
}

/** Same-origin API call authenticated with a fresh monday sessionToken (no cookies in the iframe). */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getSessionToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new MondayApiError(res.status, data.error ?? `Request failed (${res.status})`, data.code);
  return data as T;
}

export const mondayApi = {
  session: (email: string, name: string | null) =>
    request<MondaySessionStatus>('/api/monday/session', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    }),
  dashboard: () => request<DashboardSummary>('/api/monday/dashboard'),
  /** The standalone GET /api/me payload for the monday-mapped user (custom object shell). */
  me: () => request<Me>('/api/monday/me'),
  linkUrl: () => request<{ url: string }>('/api/monday/link-url'),
  /** Single-use handoff URL that opens the standalone app already signed in (works without Google). */
  appLoginUrl: () => request<{ url: string }>('/api/monday/app-login-url'),
  importClients: (clients: { name: string; email: string; phone?: string | null; documents?: string[] }[]) =>
    request<{ created: number; skipped: number }>('/api/monday/clients/import', {
      method: 'POST',
      body: JSON.stringify({ clients }),
    }),
};
