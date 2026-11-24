import { INSTITUTIONS } from '../institutionsTable.js';
import { listProviderSpecs } from './providers.js';

/**
 * The fixed list of external sites the agent is meant to log in to, one entry
 * per site × product (openspec `admin-site-access`). The admin site-access
 * screen lists every entry whether or not a fetch provider exists for it yet;
 * `isBuilt` answers that from the provider registry (providers.ts), so building
 * a provider later flips the badge with no edit here.
 *
 * Rule: a provider's id equals the catalog `site` — for the fund managers that
 * is the institution key (institutionsTable.ts), so a future Meitav provider
 * has id `meitav`. The tax authority is not an institution and keeps its own id.
 */

export type AccessGroup = 'pension' | 'study_fund' | 'other';

/** Product = the provider document key that fetches it (FetchDocumentType.key). */
export type AccessProduct = 'pension_annual' | 'study_fund_annual' | 'form106';

export interface AccessEntry {
  group: AccessGroup;
  /** Provider id / institution key. */
  site: string;
  product: AccessProduct;
  /** Site name as the screen shows it. */
  nameHe: string;
}

const nameHeOf = (key: string): string => {
  const inst = INSTITUTIONS.find((i) => i.key === key);
  if (!inst?.nameHe) throw new Error(`access catalog: institution ${key} has no Hebrew name`);
  return inst.nameHe;
};

/** The owner's target list, in screen order. */
const PENSION_SITES = ['infinity', 'altshuler_shaham', 'phoenix', 'harel', 'clal', 'migdal', 'mor', 'meitav', 'menora_mivtachim'];
const STUDY_FUND_SITES = [
  'infinity',
  'altshuler_shaham',
  'analyst',
  'harel',
  'phoenix',
  'clal',
  'yelin_lapidot',
  'migdal',
  'mor',
  'meitav',
  'menora_mivtachim',
];

export const ACCESS_CATALOG: readonly AccessEntry[] = [
  ...PENSION_SITES.map((site): AccessEntry => ({ group: 'pension', site, product: 'pension_annual', nameHe: nameHeOf(site) })),
  ...STUDY_FUND_SITES.map(
    (site): AccessEntry => ({ group: 'study_fund', site, product: 'study_fund_annual', nameHe: nameHeOf(site) }),
  ),
  { group: 'other', site: 'israel_tax_authority', product: 'form106', nameHe: 'רשות המסים' },
];

export const ACCESS_GROUPS: readonly AccessGroup[] = ['pension', 'study_fund', 'other'];

/** True when a registered fetch provider has this entry's site id and offers its product. */
export function isBuilt(entry: AccessEntry): boolean {
  return listProviderSpecs().some((p) => p.id === entry.site && p.documents.some((d) => d.key === entry.product));
}

/** The product keys a provider offers (what a NULL document_keys session fetched). */
export function providerProductKeys(providerId: string): string[] {
  const spec = listProviderSpecs().find((p) => p.id === providerId);
  return spec ? spec.documents.map((d) => d.key) : [];
}
