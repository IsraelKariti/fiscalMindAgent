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
