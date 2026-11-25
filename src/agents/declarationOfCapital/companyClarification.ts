import { isInstitutionBound } from './catalog.js';
import { identifyInstitution, institutionLabelHe, normalizeCompanyText, type Institution } from './institutions.js';
import type { FetchProviderSpec } from './documentFetch/providers.js';

/**
 * Pure rules of the company clarification (openspec
 * `item-company-clarification`): a pending item of an institution-bound type
 * whose name identifies no company of the institutions table cannot be
 * matched to a fetch website nor compared with a file's issuer, so the agent
 * asks the client which company manages it and code renames the item on the
 * client's words, "<name> — <company>", the way the per-company split names
 * items (companySplit.ts). No imports of llm/db/audit, so the tests run
 * without a database.
 */

/** The separator the per-company split uses between the name and the company. */
const SEPARATOR = ' — ';

/** Longest client text kept as a company name when the table does not know it. */
const MAX_COMPANY_TEXT = 60;

type CompanyRow = { name: string; type_key: string | null; status: string };

/** A pending row of an institution-bound type whose name identifies no company: the one the agent must ask about. */
export function rowCompanyUnknown(row: CompanyRow, table?: readonly Institution[]): boolean {
  return row.status === 'pending' && isInstitutionBound(row.type_key) && identifyInstitution(row.name, table) === null;
}

/**
 * The sites that would become offerable for a row once it names their
 * company: every usable provider (credentials resolvable, WhatsApp allowed —
 * the caller filters) whose matcher accepts the row's name with the site's
 * company appended, i.e. the exact test loadContextForProvider applies after
 * the rename. Site names in registry order.
 */
export function sitesForUnnamedRow(rowName: string, usableProviders: readonly Pick<FetchProviderSpec, 'siteNameHe' | 'documents'>[]): string[] {
  const sites: string[] = [];
  for (const spec of usableProviders) {
    const renamed = { name: `${rowName}${SEPARATOR}${spec.siteNameHe}` };
    if (spec.documents.some((t) => t.matchesRequiredDocument(renamed))) sites.push(spec.siteNameHe);
  }
  return sites;
}

/** The company text appears in the quote (both normalised the way the institutions table compares names). */
export function companyAppearsInQuote(company: string, quote: string): boolean {
  const needle = normalizeCompanyText(company).trim();
  return needle.length > 0 && normalizeCompanyText(quote).includes(needle);
}

/**
 * The name a row takes when the client names its company: the table's Hebrew
 * label when the text identifies a table company, the client's own text
 * (whitespace collapsed, capped) otherwise. `companyKey` is null for the latter.
 */
export function companyRename(rowName: string, companyText: string, table?: readonly Institution[]): { companyKey: string | null; newName: string } {
  const companyKey = identifyInstitution(companyText, table);
  const label = companyKey ? institutionLabelHe(companyKey, table) : companyText.replace(/\s+/g, ' ').trim().slice(0, MAX_COMPANY_TEXT);
  return { companyKey, newName: `${rowName}${SEPARATOR}${label}` };
}
