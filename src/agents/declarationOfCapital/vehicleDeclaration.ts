import type { ResolutionEvidence, VehicleFacts } from '../../db/types.js';

/**
 * The client's own statement about a vehicle (openspec `vehicle-declaration`):
 * the pure rules shared by the gate (which facts are in the quote), the apply
 * step (merging a statement into the row's evidence), the planner prompt (the
 * "הוצהר בצ'אט" line) and the step details. The declaration item
 * (paper `vehicle_declaration`) carries any subset of the five facts the
 * declaration lists; a fact the client does not know stays unknown and the
 * item is still settled.
 */

export const VEHICLE_FACT_KEYS = ['manufacturer', 'model', 'production_year', 'license_plate', 'purchase_cost'] as const;
export type VehicleFactKey = (typeof VEHICLE_FACT_KEYS)[number];

/** Hebrew labels of the facts, as the declaration and the card name them. */
export const VEHICLE_FACT_LABELS_HE: Record<VehicleFactKey, string> = {
  manufacturer: 'תוצר',
  model: 'דגם',
  production_year: 'שנת ייצור',
  license_plate: 'מספר רישוי',
  purchase_cost: 'עלות הרכישה',
};

/** "לא ידוע" — the value shown for a fact the client has not stated. */
export const UNKNOWN_FACT_HE = 'לא ידוע';

export type VehicleEvidence = Extract<ResolutionEvidence, { source: 'chat_vehicle' }>;

/** One statement the client made: the message and the verbatim quote. */
export interface VehicleStatement {
  message_id: string;
  quote: string;
}

/** True when at least one fact is stated. */
export function hasAnyVehicleFact(facts: VehicleFacts): boolean {
  return VEHICLE_FACT_KEYS.some((k) => facts[k] !== undefined);
}

/**
 * The vehicle evidence of a row, or null when the row holds none. Tolerates the
 * shape before migration 066 (`source: 'chat'` with amount/currency) on a
 * vehicle declaration row, reading it as a one-statement cost.
 */
export function vehicleEvidenceOf(
  evidence: ResolutionEvidence | null | undefined,
  paperKey: string | null | undefined,
): VehicleEvidence | null {
  if (!evidence || !('source' in evidence)) return null;
  if (evidence.source === 'chat_vehicle') return evidence;
  if (evidence.source === 'chat' && paperKey === 'vehicle_declaration') {
    return {
      source: 'chat_vehicle',
      statements: [{ message_id: evidence.message_id, quote: evidence.quote }],
      facts: { purchase_cost: evidence.amount, currency: evidence.currency },
    };
  }
  return null;
}

/**
 * The evidence after one more statement: the statement is appended, a fact not
 * yet recorded is filled in, a fact already recorded is replaced by the newer
 * statement (the client corrected themself), everything else is kept.
 */
export function mergeVehicleEvidence(previous: VehicleEvidence | null, statement: VehicleStatement, facts: VehicleFacts): VehicleEvidence {
  const merged: VehicleFacts = { ...(previous?.facts ?? {}) };
  for (const key of VEHICLE_FACT_KEYS) {
    const value = facts[key];
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  if (facts.purchase_cost !== undefined) merged.currency = facts.currency ?? 'ILS';
  return {
    source: 'chat_vehicle',
    statements: [...(previous?.statements ?? []), statement],
    facts: merged,
  };
}

/** Each fact as "label: value", "לא ידוע" for a missing one, in declaration order. */
export function vehicleFactsLine(facts: VehicleFacts): string {
  return VEHICLE_FACT_KEYS.map((key) => `${VEHICLE_FACT_LABELS_HE[key]}: ${formatVehicleFact(facts, key)}`).join(' · ');
}

export function formatVehicleFact(facts: VehicleFacts, key: VehicleFactKey): string {
  const value = facts[key];
  if (value === undefined || value === null || value === '') return UNKNOWN_FACT_HE;
  if (key === 'purchase_cost' && typeof value === 'number') {
    return `${value.toLocaleString('en-US')} ${facts.currency ?? 'ILS'}`;
  }
  return String(value);
}

/** Letters, digits and spaces only, lower-cased, quotes and geresh marks dropped — for the text-fact match. */
function normalizeText(text: string): string {
  return text
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[׳״'"`´‘’“”״׳]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The first stated fact that is not written in the quote, by its Hebrew label,
 * or null when every stated fact is there. A year and a plate must appear as
 * digits (a plate also with its dashes or spaces removed), a cost through the
 * amount rule the stated cost uses, make and model as text.
 */
export function vehicleFactMissingFromQuote(
  facts: VehicleFacts,
  quote: string,
  amountAppearsIn: (amount: number, quote: string) => boolean,
): VehicleFactKey | null {
  const digitsOnly = quote.replace(/[^\d]/g, '');
  const plain = normalizeText(quote);
  const plainJoined = plain.replace(/\s+/g, '');
  for (const key of VEHICLE_FACT_KEYS) {
    const value = facts[key];
    if (value === undefined) continue;
    if (key === 'purchase_cost') {
      if (!amountAppearsIn(Number(value), quote)) return key;
    } else if (key === 'production_year') {
      if (!new RegExp(`(^|\\D)${String(value)}(\\D|$)`).test(quote)) return key;
    } else if (key === 'license_plate') {
      if (!digitsOnly.includes(String(value))) return key;
    } else {
      const wanted = normalizeText(String(value));
      if (wanted === '' || !(plain.includes(wanted) || plainJoined.includes(wanted.replace(/\s+/g, '')))) return key;
    }
  }
  return null;
}
