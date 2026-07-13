import type { Client, DebtSnapshot } from '../api';
import { LOCALE } from '../format';
import { useT, type Messages } from '../i18n';

const STATUS_META: Record<DebtSnapshot['status'], { labelKey: keyof Messages; badge: string }> = {
  in_debt: { labelKey: 'dcStatusInDebt', badge: 'badge-pending' },
  no_debt: { labelKey: 'dcStatusNoDebt', badge: 'badge-success' },
  paid: { labelKey: 'dcStatusPaid', badge: 'badge-success' },
  no_data: { labelKey: 'dcStatusNoData', badge: 'badge-pending' },
};

/**
 * The debt collector's per-client analysis snapshot (agent_fields.debt),
 * written by the agent on every planning cycle. Read-only: the source of
 * truth is the accountant's sheet/board, not this card.
 */
export function DebtCard({ client }: { client: Client }) {
  const { t } = useT();
  const debt = client.agent_fields.debt;

  if (!debt) {
    return (
      <section className="card">
        <div className="card-header">
          <div>
            <h2>{t.dcCardTitle}</h2>
            <p className="muted">{t.dcNotAnalyzed}</p>
          </div>
        </div>
      </section>
    );
  }

  const status = STATUS_META[debt.status] ?? STATUS_META.no_data;
  const planLabel = {
    monthly: t.dcPlanMonthly,
    bi_monthly: t.dcPlanBiMonthly,
    other: t.dcPlanOther,
    unknown: t.dcPlanUnknown,
  }[debt.payment_plan] ?? t.dcPlanUnknown;

  const rows: { label: string; value: string | null }[] = [
    { label: t.dcAmount, value: debt.amount },
    { label: t.dcReason, value: debt.reason },
    { label: t.dcPlan, value: debt.payment_plan === 'unknown' ? null : planLabel },
    { label: t.dcRecurring, value: debt.recurring_payments },
    { label: t.dcOneTime, value: debt.one_time_payments },
  ];

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>{t.dcCardTitle}</h2>
          <p className="muted">
            {t.dcAnalyzedAt}: {new Date(debt.analyzed_at).toLocaleString(LOCALE)}
          </p>
        </div>
        <span className={`badge ${status.badge}`}>{t[status.labelKey] as string}</span>
      </div>
      <dl className="debt-details">
        {rows
          .filter((row): row is { label: string; value: string } => row.value !== null && row.value !== '')
          .map((row) => (
            <div key={row.label} className="debt-details-row">
              <dt className="muted">{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        {debt.reasoning && (
          <div className="debt-details-row">
            <dt className="muted">{t.dcReasoning}</dt>
            <dd className="muted">{debt.reasoning}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
