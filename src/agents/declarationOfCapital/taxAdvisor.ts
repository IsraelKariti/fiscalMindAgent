/**
 * The team member who handles a declaration client (openspec
 * `client-tax-advisor`): read from the declarations board's people column at
 * kickoff, matched by email to the accountant or to one entry of the
 * accountant's staff list, stored on the client as `agent_fields.tax_advisor`.
 */

export type TaxAdvisorMatch = 'accountant' | 'staff' | 'none';

export interface StoredTaxAdvisor {
  /** monday display name of the person in the cell. */
  name: string;
  /** monday email; null when the users lookup was not possible (token without users:read). */
  email: string | null;
  monday_user_id: string;
  match: TaxAdvisorMatch;
  /** The matched accountant_staff row (convenience only; may go stale when the row is removed). */
  staff_id?: string;
}

export interface MondayPerson {
  name: string;
  email: string | null;
  mondayUserId: string;
}

/** Pure matching rule: the accountant's own email wins, then the staff row, else unmatched. Emails compare case-insensitively. */
export function matchTaxAdvisor(
  person: MondayPerson,
  accountantEmail: string | null,
  staffRow: { id: string; email: string } | null,
): StoredTaxAdvisor {
  const email = person.email?.trim() || null;
  const base = { name: person.name, email, monday_user_id: person.mondayUserId };
  if (!email) return { ...base, match: 'none' };
  const lower = email.toLowerCase();
  if (accountantEmail && accountantEmail.trim().toLowerCase() === lower) return { ...base, match: 'accountant' };
  if (staffRow && staffRow.email.trim().toLowerCase() === lower) return { ...base, match: 'staff', staff_id: staffRow.id };
  return { ...base, match: 'none' };
}

/** Tolerant reader of the stored shape; null when absent or malformed. */
export function readTaxAdvisor(agentFields: Record<string, unknown>): StoredTaxAdvisor | null {
  const raw = agentFields['tax_advisor'];
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['name'] !== 'string' || typeof r['monday_user_id'] !== 'string') return null;
  const match: TaxAdvisorMatch = r['match'] === 'accountant' || r['match'] === 'staff' ? r['match'] : 'none';
  return {
    name: r['name'],
    email: typeof r['email'] === 'string' ? r['email'] : null,
    monday_user_id: r['monday_user_id'],
    match,
    ...(typeof r['staff_id'] === 'string' ? { staff_id: r['staff_id'] } : {}),
  };
}
