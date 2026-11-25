import { useEffect, useState } from 'react';
import { api, type FallbackDays, type FallbackModelCard, type FallbacksReply } from '../../api';
import { formatTimestamp, humanizePurpose, LOCALE } from '../../format';
import { useT } from '../../i18n';
import { MODEL_LABELS } from './shared';

/**
 * The fallbacks page (openspec `fallbacks-dashboard`): one card per model
 * that served in the chosen period, with the share of the calls aimed at it
 * that were handed to the stage's backup model, split by reason and by
 * stage, and what the model did as a backup. One admin route per period;
 * the period is remembered in localStorage.
 */
const STORAGE_KEY = 'admin.fallbacks.days';
const PERIODS: FallbackDays[] = [7, 30, 90, null];

function readStoredDays(): FallbackDays {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'all') return null;
    const n = Number(raw);
    return n === 7 || n === 30 || n === 90 ? n : 30;
  } catch {
    return 30;
  }
}

function writeStoredDays(days: FallbackDays): void {
  try {
    localStorage.setItem(STORAGE_KEY, days === null ? 'all' : String(days));
  } catch {
    // Private mode or blocked storage: the period just isn't remembered.
  }
}

const percent = (share: number) => `${Math.round(share * 100)}%`;
const count = (n: number) => n.toLocaleString(LOCALE);
const modelLabel = (model: string) => MODEL_LABELS[model] ?? model;

export function AdminFallbacks() {
  const { t } = useT();
  const [days, setDays] = useState<FallbackDays>(readStoredDays);
  const [data, setData] = useState<FallbacksReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .adminGetLlmFallbacks(days)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(t.fallbacksLoadFailed);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const pick = (d: FallbackDays) => {
    writeStoredDays(d);
    setDays(d);
  };

  // Rows older than the fallback mark are in the period: say since when the figures are exact.
  const sinceNote =
    data?.firstMarkedAt && data.oldestInPeriod && new Date(data.oldestInPeriod) < new Date(data.firstMarkedAt) ? data.firstMarkedAt : null;

  return (
    <div className="fallbacks-page">
      <p className="muted versions-intro">{t.fallbacksIntro}</p>
      <div className="admin-toolbar fallbacks-toolbar" role="group">
        {PERIODS.map((p) => (
          <button
            key={p ?? 'all'}
            type="button"
            className={`btn btn-small ${days === p ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={days === p}
            onClick={() => pick(p)}
          >
            {t.fallbacksPeriod[p === null ? 'all' : (String(p) as '7' | '30' | '90')]}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!error && !data && <p className="muted">{t.loading}</p>}
      {data && data.models.length === 0 && <p className="muted cost-empty">{t.fallbacksEmpty}</p>}

      {data && data.models.length > 0 && (
        <>
          <div className="stat-row fallbacks-totals">
            <div className="versions-stat">
              <span className="stat-label">{t.fallbacksTotalsCalls}</span>
              <span className="stat-value" dir="ltr">
                {count(data.totals.aimed)}
              </span>
            </div>
            <div className="versions-stat">
              <span className="stat-label">{t.fallbacksTotalsFellBack}</span>
              <span className="stat-value" dir="ltr">
                {count(data.totals.fellBack)}
              </span>
            </div>
            <div className="versions-stat">
              <span className="stat-label">{t.fallbacksTotalsShare}</span>
              <span className="stat-value" dir="ltr">
                {percent(data.totals.share)}
              </span>
            </div>
          </div>
          {sinceNote && <p className="muted fallbacks-since-note">{t.fallbacksSinceNote(formatTimestamp(sinceNote))}</p>}

          <div className="fallbacks-list">
            {data.models.map((m) => (
              <ModelCard key={m.model} card={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ModelCard({ card }: { card: FallbackModelCard }) {
  const { t } = useT();
  const p = card.primary;
  const tone = p ? (p.share >= 0.5 ? 'fallbacks-share-bad' : p.share > 0 ? 'fallbacks-share-warn' : 'fallbacks-share-ok') : 'fallbacks-share-none';

  return (
    <div className="card versions-card fallbacks-card">
      <div className="versions-card-head">
        <div className="versions-card-title">
          <span className="versions-sha" dir="ltr">
            {modelLabel(card.model)}
          </span>
          <span className="badge badge-neutral" dir="ltr">
            {card.provider}
          </span>
        </div>
        {p && (
          <span className={`fallbacks-share ${tone}`} dir="ltr">
            {percent(p.share)}
          </span>
        )}
      </div>

      {!p && <p className="muted fallbacks-none">{t.fallbacksNoPrimaryCalls}</p>}

      {p && (
        <>
          <div className="stat-row versions-stats fallbacks-stats">
            <Figure label={t.fallbacksAimed} value={p.aimed} />
            <Figure label={t.fallbacksFellBack} value={p.fellBack} />
            <Figure label={t.fallbacksFailedNoBackup} value={p.failedNoBackup} />
            <Figure label={t.fallbacksBackupAnswered} value={p.backupAnswered} />
            <Figure label={t.fallbacksBackupFailed} value={p.backupFailed} />
          </div>

          <div className="fallbacks-lists">
            {p.byReason.length > 0 && (
              <div className="versions-stages fallbacks-section">
                <h3>{t.fallbacksByReason}</h3>
                <table className="versions-stage-table">
                  <tbody>
                    {p.byReason.map((r) => (
                      <tr key={r.reason}>
                        <td>{t.fallbacksReason[r.reason] ?? r.reason}</td>
                        <td dir="ltr">{count(r.calls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="versions-stages fallbacks-section">
              <h3>{t.fallbacksByStage}</h3>
              <table className="versions-stage-table">
                <thead>
                  <tr>
                    <th>{t.fallbacksStage}</th>
                    <th>{t.fallbacksAimed}</th>
                    <th>{t.fallbacksFellBack}</th>
                    <th>{t.fallbacksTotalsShare}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.byStage.map((s) => (
                    <tr key={s.purpose}>
                      <td>{humanizePurpose(s.purpose)}</td>
                      <td dir="ltr">{count(s.aimed)}</td>
                      <td dir="ltr">{count(s.fellBack)}</td>
                      <td dir="ltr">{percent(s.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {card.asBackup && (
        <div className="versions-stages fallbacks-section">
          <h3>{t.fallbacksAsBackup}</h3>
          <div className="stat-row versions-stats fallbacks-stats fallbacks-stats-backup">
            <Figure label={t.fallbacksTook} value={card.asBackup.took} />
            <Figure label={t.fallbacksAnswered} value={card.asBackup.answered} />
          </div>
          <table className="versions-stage-table">
            <thead>
              <tr>
                <th>{t.fallbacksFromModels}</th>
                <th>{t.fallbacksTook}</th>
              </tr>
            </thead>
            <tbody>
              {card.asBackup.fromModels.map((f) => (
                <tr key={f.model}>
                  <td dir="ltr">{modelLabel(f.model)}</td>
                  <td dir="ltr">{count(f.calls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="versions-stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" dir="ltr">
        {count(value)}
      </span>
    </div>
  );
}
