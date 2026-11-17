import { useEffect, useState, type KeyboardEvent } from 'react';
import { api, type VersionCostReply, type VersionStageSummary, type VersionSummary } from '../../api';
import { formatTimestamp, formatUsd, humanizePurpose, LOCALE } from '../../format';
import { useT } from '../../i18n';
import {
  CLIENT_KINDS,
  deltaTone,
  formatDelta,
  formatShare,
  formatTokens,
  pageOf,
  readStoredFilters,
  writeStoredFilters,
  type VersionFilters,
} from './versionCost';

/**
 * Cost per app version (openspec `cost-per-version`): one card per version
 * that made LLM calls, newest first, with its totals and its cost per unit of
 * work, each compared with the previous version. The figures come from one
 * admin route per filter choice; the filters are remembered in localStorage.
 */
export function AdminVersions() {
  const { t } = useT();
  const [filters, setFilters] = useState<VersionFilters>(readStoredFilters);
  const [data, setData] = useState<VersionCostReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setExpanded(null);
    setPage(1);
    api
      .adminGetVersionCost(filters)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(t.versionsLoadFailed);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.agentInstanceId, filters.clients]);

  useEffect(() => {
    writeStoredFilters(filters);
  }, [filters]);

  const { shown, more } = pageOf(data?.versions ?? [], page);
  const keyOf = (v: VersionSummary) => v.version ?? '__before__';
  const toggle = (v: VersionSummary) => setExpanded((cur) => (cur === keyOf(v) ? null : keyOf(v)));
  const onKey = (e: KeyboardEvent<HTMLDivElement>, v: VersionSummary) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(v);
    }
  };
  const instanceLabel = (i: VersionCostReply['instances'][number]) =>
    [i.accountantEmail, i.name].filter(Boolean).join(' · ') || i.id.slice(0, 8);

  return (
    <div className="versions-page">
      <p className="muted versions-intro">{t.versionsIntro}</p>
      <div className="usage-toolbar">
        <div className="admin-toolbar usage-toolbar-row">
          <label className="usage-filter">
            <span className="usage-filter-label">{t.versionsInstanceFilterLabel}</span>
            <select value={filters.agentInstanceId} onChange={(e) => setFilters({ ...filters, agentInstanceId: e.target.value })}>
              <option value="all">{t.versionsAllInstances}</option>
              {(data?.instances ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {instanceLabel(i)}
                </option>
              ))}
            </select>
          </label>
          <label className="usage-filter">
            <span className="usage-filter-label">{t.versionsClientsFilterLabel}</span>
            <select value={filters.clients} onChange={(e) => setFilters({ ...filters, clients: e.target.value as VersionFilters['clients'] })}>
              {CLIENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t.versionsClients[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!error && !data && <p className="muted">{t.loading}</p>}
      {data && data.versions.length === 0 && <p className="muted cost-empty">{t.versionsEmpty}</p>}

      {data && shown.length > 0 && (
        <div className="versions-list">
          {shown.map((v) => (
            <VersionCard key={keyOf(v)} version={v} expanded={expanded === keyOf(v)} onToggle={() => toggle(v)} onKey={(e) => onKey(e, v)} />
          ))}
          {more && (
            <button type="button" className="btn btn-ghost versions-more" onClick={() => setPage((p) => p + 1)}>
              {t.versionsShowMore}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Delta({ delta }: { delta: number | null }) {
  const { t } = useT();
  const tone = deltaTone(delta);
  if (tone === 'none') return null;
  return (
    <span className={`versions-delta versions-delta-${tone}`} dir="ltr" title={t.versionsDeltaTitle}>
      {formatDelta(delta)}
    </span>
  );
}

function VersionCard({
  version: v,
  expanded,
  onToggle,
  onKey,
}: {
  version: VersionSummary;
  expanded: boolean;
  onToggle: () => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const { t } = useT();
  const before = v.version === null;
  const cost = (value: number, unpriced: number) => `${value === 0 ? '$0' : formatUsd(value)}${unpriced > 0 ? '+' : ''}`;
  const unit = (value: number | null) => (value === null ? '—' : formatUsd(value));

  return (
    <div
      className={`card versions-card ${expanded ? 'versions-card-open' : ''} ${before ? 'versions-card-before' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={before ? t.versionsBefore : v.version ?? ''}
      onClick={onToggle}
      onKeyDown={onKey}
    >
      <div className="versions-card-head">
        <div className="versions-card-title">
          {before ? (
            <span className="versions-sha">{t.versionsBefore}</span>
          ) : (
            <span className="versions-sha mono" dir="ltr">
              {v.version}
            </span>
          )}
          {v.fewCalls && <span className="badge badge-warning">{t.versionsFewCalls}</span>}
          {v.unpriced > 0 && (
            <span className="badge badge-neutral" title={t.versionsUnpricedNote}>
              +
            </span>
          )}
        </div>
        <div className="versions-card-when muted">
          <span>
            {t.versionsFirstCall}: {formatTimestamp(v.firstAt)}
          </span>
          <span>
            {t.versionsLastCall}: {formatTimestamp(v.lastAt)}
          </span>
          <span>{t.versionsDaysActive(v.daysActive)}</span>
        </div>
      </div>
      {before && <p className="muted versions-before-note">{t.versionsBeforeNote}</p>}

      <div className="stat-row versions-stats">
        <div className="versions-stat">
          <span className="stat-label">{t.versionsCalls}</span>
          <span className="stat-value" dir="ltr">
            {v.calls.toLocaleString(LOCALE)}
          </span>
          <span className="stat-context">{t.versionsFailed(v.failed)}</span>
        </div>
        <div className="versions-stat">
          <span className="stat-label">{t.versionsTotalCost}</span>
          <span className="stat-value" dir="ltr">
            {cost(v.cost, v.unpriced)}
          </span>
          <span className="stat-context">{v.unpriced > 0 ? t.versionsUnpricedNote : ''}</span>
        </div>
        <div className="versions-stat">
          <span className="stat-label">{t.versionsCostPerCycle}</span>
          <span className="stat-value" dir="ltr">
            {unit(v.costPerCycle)}
            <Delta delta={v.costPerCycleDelta} />
          </span>
          <span className="stat-context">{t.versionsCycles(v.cycles)}</span>
        </div>
        <div className="versions-stat">
          <span className="stat-label">{t.versionsCostPerDocument}</span>
          <span className="stat-value" dir="ltr">
            {unit(v.costPerDocument)}
            <Delta delta={v.costPerDocumentDelta} />
          </span>
          <span className="stat-context">{t.versionsDocuments(v.documents)}</span>
        </div>
        <div className="versions-stat">
          <span className="stat-label">{t.versionsPlannerInputTokens}</span>
          <span className="stat-value" dir="ltr">
            {formatTokens(v.plannerInputTokensAvg, LOCALE)}
            <Delta delta={v.plannerInputTokensDelta} />
          </span>
          <span className="stat-context">{t.versionsPlannerCalls(v.plannerCalls)}</span>
        </div>
      </div>

      <div className="versions-card-foot muted">{expanded ? t.versionsCollapse : t.versionsExpand}</div>

      {expanded && (
        <div className="versions-stages" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <h3>{t.versionsStagesTitle}</h3>
          <table className="versions-stage-table">
            <thead>
              <tr>
                <th>{t.versionsColStage}</th>
                <th>{t.versionsColCalls}</th>
                <th>{t.versionsColFailed}</th>
                <th>{t.versionsColAvgCost}</th>
                <th>{t.versionsColAvgInput}</th>
                <th>{t.versionsColAvgOutput}</th>
                <th>{t.versionsColCacheShare}</th>
              </tr>
            </thead>
            <tbody>
              {v.stages.map((s) => (
                <StageRow key={s.purpose} stage={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StageRow({ stage: s }: { stage: VersionStageSummary }) {
  const { t } = useT();
  return (
    <tr>
      <td>
        {t.llmPurposeLabels[s.purpose] ?? humanizePurpose(s.purpose)}{' '}
        <span className="badge badge-neutral mono" dir="ltr">
          {s.purpose}
        </span>
      </td>
      <td dir="ltr">{s.calls.toLocaleString(LOCALE)}</td>
      <td dir="ltr">{s.failed.toLocaleString(LOCALE)}</td>
      <td dir="ltr">
        {formatUsd(s.avgCost)}
        {s.unpriced > 0 ? '+' : ''} <Delta delta={s.avgCostDelta} />
      </td>
      <td dir="ltr">
        {formatTokens(s.avgInputTokens, LOCALE)} <Delta delta={s.avgInputTokensDelta} />
      </td>
      <td dir="ltr">{formatTokens(s.avgOutputTokens, LOCALE)}</td>
      <td dir="ltr">{formatShare(s.cacheShare)}</td>
    </tr>
  );
}
