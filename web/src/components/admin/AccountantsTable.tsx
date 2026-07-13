import { useMemo, useState } from 'react';
import { getAgentUI } from '../../agents/registry';
import { useT } from '../../i18n';
import { AddAccountantModal } from '../AddAccountantModal';
import { StatusBadge, TierBadge, rowStatus, type AccountantRow, type RowStatus } from './shared';

interface Props {
  rows: AccountantRow[];
  onOpen: (email: string) => void;
  onAdded: () => void;
}

/** The accountant roster: a searchable, filterable full-width table; a row opens the accountant's page. */
export function AccountantsTable({ rows, onOpen, onAdded }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RowStatus | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && rowStatus(row) !== statusFilter) return false;
      if (!q) return true;
      return row.email.includes(q) || (row.name ?? '').toLowerCase().includes(q);
    });
  }, [rows, query, statusFilter]);

  return (
    <section className="card admin-roster">
      <div className="card-header">
        <div className="card-title-row">
          <h2>{t.accountantsLabel}</h2>
          <span className="badge badge-neutral">{rows.length === 1 ? t.oneAccount : t.nAccounts(rows.length)}</span>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          {t.addShort}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="muted">{t.noAccountantsYet}</div>
      ) : (
        <>
          <div className="admin-toolbar">
            <input
              type="search"
              className="admin-search"
              placeholder={t.adminSearchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label={t.adminStatusLabel}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RowStatus | 'all')}
            >
              <option value="all">{t.filterAll}</option>
              <option value="active">{t.activeBadge}</option>
              <option value="invited">{t.invitedBadge}</option>
              <option value="none">{t.noAccessBadge}</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <div className="muted">{t.adminNoMatches}</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-col-name">{t.nameLabel}</th>
                    <th className="admin-col-email">{t.emailLabel}</th>
                    <th>{t.adminStatusLabel}</th>
                    <th>{t.tierLabel}</th>
                    <th>{t.adminAgentsTitle}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.email}
                      className="admin-table-row"
                      tabIndex={0}
                      onClick={() => onOpen(row.email)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onOpen(row.email);
                      }}
                    >
                      <td className="admin-table-name">{row.name ?? <span className="muted">—</span>}</td>
                      <td>
                        <span dir="ltr">{row.email}</span>
                      </td>
                      <td>
                        <StatusBadge row={row} />
                      </td>
                      <td>{row.tier === 'premium' ? <TierBadge row={row} /> : row.tier ? t.tierNormal : '—'}</td>
                      <td>
                        {row.user && row.user.agents.some((a) => a.enabled) ? (
                          <span
                            title={row.user.agents
                              .filter((a) => a.enabled)
                              .map((a) => a.name ?? t[getAgentUI(a.agentType).nameKey])
                              .join(' · ')}
                          >
                            {row.user.agents.filter((a) => a.enabled).length}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {adding && (
        <AddAccountantModal
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onAdded();
          }}
        />
      )}
    </section>
  );
}
