import { useEffect, useState } from 'react';
import { api, type SiteAccessEntry, type SiteAccessGroup, type SiteAccessReply, type SiteHealth } from '../../api';
import { formatTimestamp, LOCALE } from '../../format';
import { useT } from '../../i18n';

/**
 * Site access monitor (openspec `admin-site-access`): three sections (pension
 * funds, study funds, other sites), one card per site × product with a built
 * badge, a health badge, four access counts and the last access. Read-only;
 * one admin route, loaded when the screen opens.
 */
export function AdminSiteAccess() {
  const { t } = useT();
  const [data, setData] = useState<SiteAccessReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .adminSiteAccess()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(t.siteAccessLoadFailed);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="site-access-page">
      <p className="muted site-access-intro">{t.siteAccessIntro}</p>
      {error && <div className="error-banner">{error}</div>}
      {!error && !data && <p className="muted">{t.loading}</p>}
      {data && data.groups.map((g) => <SiteGroup key={g.key} group={g} />)}
    </div>
  );
}

function SiteGroup({ group }: { group: SiteAccessGroup }) {
  const { t } = useT();
  return (
    <section className="site-access-group">
      <div className="site-access-group-head">
        <h3 className="site-access-group-title">{t.siteAccessGroup[group.key]}</h3>
        <span className="muted site-access-group-meta">
          <span>{t.siteAccessBuiltOf(group.builtCount, group.size)}</span>
          <span>{t.siteAccessGroupTotal(group.totalAccesses)}</span>
        </span>
      </div>
      <div className="site-access-grid">
        {group.entries.map((e) => (
          <SiteCard key={`${e.site}/${e.product}`} entry={e} />
        ))}
      </div>
    </section>
  );
}

const HEALTH_BADGE: Record<SiteHealth, string> = {
  no_data: 'badge-neutral',
  healthy: 'badge-success',
  warning: 'badge-warning',
  failing: 'badge-danger',
};

function SiteCard({ entry: e }: { entry: SiteAccessEntry }) {
  const { t } = useT();
  const n = (v: number) => v.toLocaleString(LOCALE);
  return (
    <div className={`card site-access-card ${e.built ? '' : 'site-access-card-unbuilt'}`}>
      <div className="site-access-card-head">
        <span className="site-access-card-title">{e.nameHe}</span>
        <span className="site-access-badges">
          <span className={`badge ${e.built ? 'badge-success' : 'badge-neutral'}`}>{e.built ? t.siteAccessBuilt : t.siteAccessNotBuilt}</span>
          {e.built && <span className={`badge ${HEALTH_BADGE[e.health]}`}>{t.siteAccessHealth[e.health]}</span>}
        </span>
      </div>
      <div className="stat-row site-access-stats">
        <Stat label={t.siteAccessCountTotal} value={n(e.counts.total)} />
        <Stat label={t.siteAccessCountToday} value={n(e.counts.today)} />
        <Stat label={t.siteAccessCount7} value={n(e.counts.last7)} />
        <Stat label={t.siteAccessCount30} value={n(e.counts.last30)} />
      </div>
      {e.built && (
        <div className="muted site-access-last">
          {e.last ? (
            <>
              <span>
                {t.siteAccessLast}: {formatTimestamp(e.last.at)} · {t.siteAccessOutcome[e.last.outcome]}
              </span>
              {e.last.outcome === 'failed' && e.last.error && (
                <span className="site-access-error mono" dir="ltr">
                  {e.last.error}
                </span>
              )}
            </>
          ) : (
            <span>{t.siteAccessNoAccessYet}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="site-access-stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" dir="ltr">
        {value}
      </span>
    </div>
  );
}
