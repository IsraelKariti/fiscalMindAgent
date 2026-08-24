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
 * The tax year one client's documents are collected for: the per-client year
 * (declaration-of-capital clients get it from their monday board row at
 * enrollment, stored in agent_fields.tax_year), falling back to the instance's
 * admin-configured year and then to the last concluded year.
 */
export function resolveClientTaxYear(
  client: { agent_fields: Record<string, unknown> } | null,
  instance: { tax_year: number | null } | null,
  now: Date,
): number {
  const perClient = client?.agent_fields['tax_year'];
  if (typeof perClient === 'number' && Number.isInteger(perClient)) return perClient;
  return resolveTaxYear(instance, now);
}
