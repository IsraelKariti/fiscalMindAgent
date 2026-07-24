import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type AnomalyAlert, type AuditEvent } from '../../api';
import { LOCALE } from '../../format';
import { useT } from '../../i18n';

const RANGES = [7, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function severityBadge(severity: AuditEvent['severity'] | AnomalyAlert['severity']): string {
  return severity === 'critical' ? 'badge-danger' : severity === 'warning' ? 'badge-warning' : 'badge-neutral';
}

/** Compact one-line rendering of an event's detail JSONB for the table cell. */
function detailSummary(detail: Record<string, unknown>): string {
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  const joined = parts.join(' · ');
  return joined.length > 160 ? `${joined.slice(0, 160)}…` : joined;
}

/**
 * The audit page (#/audit): open anomaly alerts on top (acknowledgeable),
 * then the per-action audit trail — the newest raw rows, filtered
 * client-side like the usage page.
 */
export function AdminAudit() {
  const { t } = useT();
  const [days, setDays] = useState<RangeDays>(7);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [alerts, setAlerts] = useState<AnomalyAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  const refresh = useCallback(async () => {
    const [{ events: rows }, { alerts: alertRows }] = await Promise.all([
      api.adminAuditEvents(days),
      api.adminListAlerts(),
    ]);
    setEvents(rows);
    setAlerts(alertRows);
    setError(null);
  }, [days]);

  useEffect(() => {
    refresh().catch(() => setError(t.auditLoadFailed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const ack = async (id: string) => {
    setAckingId(id);
    try {
      await api.adminAckAlert(id);
      await refresh();
    } catch {
      setError(t.auditAckFailed);
    } finally {
      setAckingId(null);
    }
  };

  const actions = useMemo(() => [...new Set((events ?? []).map((e) => e.action))].sort(), [events]);

  const filtered = useMemo(
    () =>
      (events ?? []).filter(
        (e) =>
          (actorFilter === 'all' || e.actorType === actorFilter) &&
          (severityFilter === 'all' || e.severity === severityFilter) &&
          (actionFilter === 'all' || e.action === actionFilter),
      ),
    [events, actorFilter, severityFilter, actionFilter],
  );

  const openAlerts = (alerts ?? []).filter((a) => a.status === 'open');
  const ackedAlerts = (alerts ?? []).filter((a) => a.status === 'acked');

  const actorLabel: Record<AuditEvent['actorType'], string> = {
    agent: t.auditActorAgent,
    admin: t.auditActorAdmin,
    accountant: t.auditActorAccountant,
    system: t.auditActorSystem,
  };

  return (
    <div className="usage-page">
      {error && <div className="error-banner">{error}</div>}

      <section className="card">
        <h3 className="chart-title">{t.auditAlertsTitle}</h3>
        {!alerts && <div className="muted">{t.loading}</div>}
        {alerts && openAlerts.length === 0 && <p className="muted">{t.auditNoOpenAlerts}</p>}
        {openAlerts.map((a) => (
          <div key={a.id} className="admin-toolbar" style={{ alignItems: 'center', marginBlock: '0.5rem' }}>
            <span className={`badge ${severityBadge(a.severity)}`}>
              {a.severity === 'critical' ? t.auditSeverityCritical : t.auditSeverityWarning}
            </span>
            <span>{a.title}</span>
            <span className="muted" dir="ltr">
              {formatWhen(a.createdAt)}
            </span>
            <button className="btn btn-small" disabled={ackingId === a.id} onClick={() => ack(a.id)}>
              {ackingId === a.id ? t.auditAcking : t.auditAckButton}
            </button>
          </div>
        ))}
        {ackedAlerts.length > 0 && (
          <p className="muted">{t.auditAckedCount(ackedAlerts.length)}</p>
        )}
      </section>

      <section className="card">
        <h3 className="chart-title">{t.auditTrailTitle}</h3>
        <div className="admin-toolbar usage-toolbar-row">
          <label className="usage-filter">
            <span className="usage-filter-label">{t.auditRangeLabel}</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value) as RangeDays)}>
              {RANGES.map((n) => (
                <option key={n} value={n}>
                  {t.usageRangeDays(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="usage-filter">
            <span className="usage-filter-label">{t.auditActorLabel}</span>
            <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
              <option value="all">{t.auditAllActors}</option>
              {(['agent', 'admin', 'accountant', 'system'] as const).map((a) => (
                <option key={a} value={a}>
                  {actorLabel[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="usage-filter">
            <span className="usage-filter-label">{t.auditSeverityLabel}</span>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="all">{t.auditAllSeverities}</option>
              <option value="info">{t.auditSeverityInfo}</option>
              <option value="warning">{t.auditSeverityWarning}</option>
              <option value="critical">{t.auditSeverityCritical}</option>
            </select>
          </label>
          <label className="usage-filter">
            <span className="usage-filter-label">{t.auditActionLabel}</span>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">{t.auditAllActions}</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!events && !error && <div className="muted">{t.loading}</div>}
        {events && filtered.length === 0 && <p className="muted">{t.auditNoEvents}</p>}
        {filtered.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t.auditColWhen}</th>
                  <th>{t.auditColActor}</th>
                  <th>{t.auditColAction}</th>
                  <th>{t.auditColClient}</th>
                  <th>{t.auditColAgent}</th>
                  <th>{t.auditColSeverity}</th>
                  <th>{t.auditColDetail}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td dir="ltr">{formatWhen(e.occurredAt)}</td>
                    <td>{e.actorEmail ?? actorLabel[e.actorType]}</td>
                    <td dir="ltr">{e.action}</td>
                    <td>{e.clientName ?? (typeof e.detail['clientName'] === 'string' ? (e.detail['clientName'] as string) : '—')}</td>
                    <td>{e.instanceName ?? e.agentType ?? '—'}</td>
                    <td>
                      <span className={`badge ${severityBadge(e.severity)}`}>
                        {e.severity === 'critical'
                          ? t.auditSeverityCritical
                          : e.severity === 'warning'
                            ? t.auditSeverityWarning
                            : t.auditSeverityInfo}
                      </span>
                    </td>
                    <td dir="auto" className="muted">
                      {detailSummary(e.detail)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
