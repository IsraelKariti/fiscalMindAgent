import type { Page } from 'playwright';

export interface FetchedDocument {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface PortalLoginCredentials {
  idNumber: string;
  userCode: string;
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
   * is what makes the site send the SMS one-time code to the client's phone.
   */
  startLogin(page: Page, creds: PortalLoginCredentials): Promise<void>;
  /**
   * Types the OTP and completes login. Throws OtpRejectedError when the site
   * rejects the code and the OTP screen is still up (so the caller can re-ask).
   */
  submitOtp(page: Page, otp: string): Promise<void>;
  /** Navigates to and downloads the requested document. */
  downloadDocument(page: Page, opts: { taxYear: number }): Promise<FetchedDocument>;
}

/** The site said the OTP was wrong; the login can be retried with a new code. */
export class OtpRejectedError extends Error {
  constructor(message = 'the tax authority rejected the one-time code') {
    super(message);
    this.name = 'OtpRejectedError';
  }
}
