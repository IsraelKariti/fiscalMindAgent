/** The most recently concluded calendar year — the fallback target when no tax year is configured. */
export function defaultTaxYear(now: Date): number {
  return now.getFullYear() - 1;
}

/**
 * The tax year an agent instance collects documents for: the admin-configured
 * agent_instances.tax_year, falling back to the most recently concluded year
 * (also the path for legacy CLI-era clients that have no instance).
 */
export function resolveTaxYear(instance: { tax_year: number | null } | null, now: Date): number {
  return instance?.tax_year ?? defaultTaxYear(now);
}

/** Sanity bounds for a per-client declaration year read from a monday board cell. */
export function parseTaxYearCell(cell: string | undefined): number | null {
  const year = Number.parseInt((cell ?? '').trim(), 10);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

/**
 * The declaration year of one capital-declaration client — per client ONLY,
 * read from the monday board row at kickoff and stored in
 * agent_fields.tax_year. There is deliberately no instance-level fallback
 * (collectsTaxYear=false for this type); the last concluded year covers only
 * legacy rows enrolled before the per-client year existed.
 */
export function capitalClientTaxYear(client: { agent_fields: Record<string, unknown> } | null, now: Date): number {
  const perClient = client?.agent_fields['tax_year'];
  if (typeof perClient === 'number' && Number.isInteger(perClient)) return perClient;
  return defaultTaxYear(now);
}
