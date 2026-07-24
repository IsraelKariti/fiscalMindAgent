import { useState } from 'react';
import type { Client, DebtSnapshot } from '../api';
import { LOCALE } from '../format';
import { useT, type Messages } from '../i18n';

const STATUS_META: Record<DebtSnapshot['status'], { labelKey: keyof Messages; badge: string }> = {
  in_debt: { labelKey: 'dcStatusInDebt', badge: 'badge-pending' },
  no_debt: { labelKey: 'dcStatusNoDebt', badge: 'badge-success' },
  paid: { labelKey: 'dcStatusPaid', badge: 'badge-success' },
  paid_claimed: { labelKey: 'dcStatusPaidClaimed', badge: 'badge-warning' },
  no_data: { labelKey: 'dcStatusNoData', badge: 'badge-pending' },
};

/**
 * The debt collector's per-client analysis snapshot (agent_fields.debt),
 * written by the agent on every planning cycle. Mostly read-only — the source
 * of truth is the accountant's sheet/board — except the 'paid_claimed' state,
 * where the accountant confirms the client's payment claim.
 */
export function DebtCard({ client, onConfirmPaid }: { client: Client; onConfirmPaid?: () => Promise<void> }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debt = client.agent_fields.debt;

  const confirmPaid = async () => {
    if (!onConfirmPaid) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirmPaid();
    } catch {
      setError(t.dcConfirmPaidFailed);
    } finally {
      setBusy(false);
    }
  };

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
      {debt.status === 'paid_claimed' && onConfirmPaid && (
        <div className="debt-confirm">
          <p className="muted">{t.dcConfirmPaidNote}</p>
          {error && <div className="error-banner">{error}</div>}
          <button className="btn btn-primary" disabled={busy} onClick={confirmPaid}>
            {t.dcConfirmPaid}
          </button>
        </div>
      )}
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
