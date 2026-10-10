import type { ClientDocumentRow } from '../../db/types.js';
import { sanitizeInline } from '../shared/promptSafety.js';

/**
 * The facts an approved property paper proved (openspec
 * `real-estate-goal-driven-clarification`), read back from the verification
 * record the extraction stored on the row. Pure: the planner prompt shows
 * them ("הוכח במסמך שאושר"), the validate_message gate relies on the seller
 * kind when the planner cites the file instead of a client quote.
 *
 * Only an APPROVED `real_estate` row yields facts — a received, matched or
 * rejected file settles nothing. Rows approved before the typed fields
 * existed carry the owners (from `parties`) and nothing else.
 */

export type SellerKind = 'private' | 'builder';

export interface ProvenFacts {
  /** Names of the owners the document names (the ownership check passed, or the row would not be approved). */
  owners: string[];
  purchasePrice: { value: number; currency: string | null } | null;
  sellerKind: SellerKind | null;
  address: string | null;
  purchaseYear: number | null;
}

/** An approved property paper the planner may cite as evidence (by file id). */
export interface ApprovedPropertyFile {
  documentId: string;
  sellerKind: SellerKind | null;
}

const MAX_OWNERS = 6;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = sanitizeInline(value, max).trim();
  return clean === '' ? null : clean;
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function sellerKindOf(value: unknown): SellerKind | null {
  return value === 'private' || value === 'builder' ? value : null;
}

/** The stored extraction of an approved property row; null for any other row. */
function approvedExtraction(doc: Pick<ClientDocumentRow, 'status' | 'type_key' | 'verification'>): Record<string, unknown> | null {
  if (doc.status !== 'approved' || doc.type_key !== 'real_estate') return null;
  const record = doc.verification;
  if (!record || record['passed'] !== true) return null;
  const extracted = record['extracted'];
  return extracted && typeof extracted === 'object' ? (extracted as Record<string, unknown>) : null;
}

/** The facts an approved property row proved; null when the row is not an approved property paper or its record holds nothing usable. */
export function provenFactsOf(doc: Pick<ClientDocumentRow, 'status' | 'type_key' | 'verification'>): ProvenFacts | null {
  const extracted = approvedExtraction(doc);
  if (!extracted) return null;
  const parties = Array.isArray(extracted['parties']) ? (extracted['parties'] as unknown[]) : [];
  const owners = parties
    .filter((p): p is { name?: unknown; role?: unknown } => !!p && typeof p === 'object' && (p as { role?: unknown }).role === 'owner')
    .map((p) => text(p.name, 80))
    .filter((n): n is string => n !== null)
    .slice(0, MAX_OWNERS);
  const price = number(extracted['purchase_price']);
  const facts: ProvenFacts = {
    owners,
    purchasePrice: price === null ? null : { value: price, currency: text(extracted['price_currency'], 3) },
    sellerKind: sellerKindOf(extracted['seller_kind']),
    address: text(extracted['property_address'], 120),
    purchaseYear: number(extracted['purchase_year']),
  };
  const empty =
    facts.owners.length === 0 &&
    facts.purchasePrice === null &&
    facts.sellerKind === null &&
    facts.address === null &&
    facts.purchaseYear === null;
  return empty ? null : facts;
}

/** The Hebrew line the planner reads for an approved property paper, or null when there is nothing to say. */
export function provenFactsLine(facts: ProvenFacts | null): string | null {
  if (!facts) return null;
  const parts: string[] = [];
  if (facts.owners.length > 0) parts.push(`בעלות — על שם ${facts.owners.join(', ')}`);
  if (facts.purchasePrice) {
    const amount = facts.purchasePrice.value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    parts.push(`עלות רכישה — ${amount}${facts.purchasePrice.currency ? ` ${facts.purchasePrice.currency}` : ''}`);
  }
  if (facts.sellerKind === 'private') parts.push('המוכר — אדם פרטי (= נרכש יד שנייה)');
  if (facts.sellerKind === 'builder') parts.push('המוכר — קבלן / חברה (= נרכש מקבלן)');
  if (facts.purchaseYear !== null) parts.push(`שנת רכישה — ${facts.purchaseYear}`);
  if (facts.address) parts.push(`כתובת — ${facts.address}`);
  return parts.length === 0 ? null : `הוכח במסמך שאושר: ${parts.join('; ')}`;
}

/**
 * The approved property papers of a client, by the id of the file that was
 * verified (the record's `file_id`), with the seller kind the paper proved —
 * the pool `proven_by_file_id` may cite (validate_message).
 */
export function approvedPropertyFilesOf(
  documents: readonly Pick<ClientDocumentRow, 'id' | 'status' | 'type_key' | 'verification'>[],
): Map<string, ApprovedPropertyFile> {
  const out = new Map<string, ApprovedPropertyFile>();
  for (const doc of documents) {
    const extracted = approvedExtraction(doc);
    if (!extracted) continue;
    const fileId = doc.verification?.['file_id'];
    if (typeof fileId !== 'string' || fileId === '') continue;
    out.set(fileId, { documentId: doc.id, sellerKind: sellerKindOf(extracted['seller_kind']) });
  }
  return out;
}
