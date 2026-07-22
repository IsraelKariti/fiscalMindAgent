import type { Browser, Page } from 'playwright';
import { env } from '../../config/env.js';
import { launchInteractivePage } from '../launch.js';
import { israelTaxAuthorityProvider } from './israelTaxAuthority.js';
import { mockProvider } from './mock.js';
import type { DocumentFetchProvider } from './types.js';

const REAL_PROVIDERS: Record<string, DocumentFetchProvider> = {
  israel_tax_authority: israelTaxAuthorityProvider,
};

/** True when we should use the no-browser mock instead of driving real Chrome. */
export function isMockMode(): boolean {
  return env.TAX_FETCH_MOCK;
}

export function getProvider(id: string): DocumentFetchProvider {
  if (isMockMode()) return mockProvider;
  const provider = REAL_PROVIDERS[id];
  if (!provider) throw new Error(`unknown document-fetch provider: ${id}`);
  return provider;
}

/** A launched browser to drive, or nulls in mock mode (the mock ignores the page). */
export interface ProviderBrowser {
  browser: Browser | null;
  page: Page;
}

/** Launches a real browser, or a placeholder page the mock never touches. */
export async function launchForProvider(): Promise<ProviderBrowser> {
  if (isMockMode()) return { browser: null, page: {} as Page };
  const { browser, page } = await launchInteractivePage();
  return { browser, page };
}
