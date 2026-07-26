import type { Page } from 'playwright';

export interface FetchedDocument {
  buffer: Buffer;
  filename: string;
  contentType: string;
  /** Employer name exactly as the source site spells it (multi-employer Form 106), when the site provides one. */
  employerName?: string | null;
  /**
   * Provider-defined document kind (e.g. the tax authority's 'form106' /
   * 'salary_summary'). The worker's delivery spec for the same provider
   * interprets it; the runner treats it as opaque.
   */
  kind?: string | null;
}

/**
 * Login values keyed per provider (the tax authority: idNumber+userCode;
 * Meitav: idNumber+phoneNumber). The worker assembles the map; each provider
 * validates its own required keys via requireCredential().
 */
export type PortalCredentials = Record<string, string>;

/** Pulls a required key out of the credentials map, failing loudly when the worker sent the wrong shape. */
export function requireCredential(credentials: PortalCredentials, key: string, providerId: string): string {
  const value = credentials[key];
  if (!value) throw new Error(`provider ${providerId} requires credential "${key}"`);
  return value;
}

/**
 * A website the runner can log into and download a document from, on a client's
 * behalf. Each method drives one live Playwright page. Implementations are
 * stateless — the server owns the browser/page lifecycle.
 */
export interface DocumentFetchProvider {
  /** Registry id; matches client_portal_credentials.provider and tax_fetch_sessions.provider. */
  id: string;
  /**
   * Fills the login form and submits, leaving the page on the OTP screen. This
   * is what makes the site send the one-time code to the client (email or SMS,
   * depending on the site).
   */
  startLogin(page: Page, credentials: PortalCredentials): Promise<void>;
  /**
   * Types the OTP and completes login. Throws OtpRejectedError when the site
   * rejects the code and the OTP screen is still up (so the caller can re-ask).
   */
  submitOtp(page: Page, otp: string): Promise<void>;
  /**
   * Navigates to and downloads the requested document types in this one session.
   * `documentKeys` are the provider's FetchDocumentType keys the client agreed to
   * (e.g. ['pension_annual','study_fund_annual']); a provider that only fetches
   * one thing (Form 106) ignores them.
   */
  downloadDocuments(page: Page, opts: { taxYear: number; documentKeys: string[] }): Promise<FetchedDocument[]>;
}

/** The site said the OTP was wrong; the login can be retried with a new code. */
export class OtpRejectedError extends Error {
  constructor(message = 'the tax authority rejected the one-time code') {
    super(message);
    this.name = 'OtpRejectedError';
  }
}
