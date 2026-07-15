import { useMemo, useState } from 'react';
import type { Accountant } from '../../api';
import { getAgentUI } from '../../agents/registry';
import { useT } from '../../i18n';

interface Props {
  accountants: Accountant[];
  onOpenAgent: (email: string, agentType: string) => void;
}

/** One agent instance flattened out of the accountant roster. */
interface AgentRow {
  id: string;
  agentType: string;
  /** Instance name when set, else the type's display name. */
  label: string;
  enabled: boolean;
  clientCount: number;
  accountantEmail: string;
  accountantName: string | null;
}

type AgentStatusFilter = 'all' | 'active' | 'disabled';

/** Every agent instance across all accountants; a row opens that agent's page. */
export function AdminAgents({ accountants, onOpenAgent }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AgentStatusFilter>('all');

  const rows = useMemo<AgentRow[]>(
    () =>
      accountants
        .flatMap((accountant) =>
          accountant.agents.map((agent) => ({
            id: agent.id,
            agentType: agent.agentType,
            label: agent.name ?? t[getAgentUI(agent.agentType).nameKey],
            enabled: agent.enabled,
            clientCount: agent.clientCount,
            accountantEmail: accountant.email.toLowerCase(),
            accountantName: accountant.name,
          })),
        )
        .sort(
          (a, b) =>
            a.accountantEmail.localeCompare(b.accountantEmail) || a.agentType.localeCompare(b.agentType),
        ),
    [accountants, t],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'active' && !row.enabled) return false;
      if (statusFilter === 'disabled' && row.enabled) return false;
      if (!q) return true;
      return (
        row.label.toLowerCase().includes(q) ||
        row.agentType.toLowerCase().includes(q) ||
        row.accountantEmail.includes(q) ||
        (row.accountantName ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  return (
    <section className="card admin-roster">
      <div className="card-header">
        <div className="card-title-row">
          <h2>{t.adminAgentsTitle}</h2>
          <span className="badge badge-neutral">{rows.length === 1 ? t.oneAgent : t.nAgents(rows.length)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="muted">{t.adminNoAgentsYet}</div>
      ) : (
        <>
          <div className="admin-toolbar">
            <input
              type="search"
              className="admin-search"
              placeholder={t.adminAgentsSearchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label={t.adminStatusLabel}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AgentStatusFilter)}
            >
              <option value="all">{t.filterAll}</option>
              <option value="active">{t.activeBadge}</option>
              <option value="disabled">{t.adminAgentDisabledBadge}</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <div className="muted">{t.adminNoMatches}</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-col-name">{t.adminAgentColumn}</th>
                    <th className="admin-col-email">{t.adminAccountantColumn}</th>
                    <th>{t.adminStatusLabel}</th>
                    <th>{t.clientsLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className="admin-table-row"
                      tabIndex={0}
                      onClick={() => onOpenAgent(row.accountantEmail, row.agentType)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onOpenAgent(row.accountantEmail, row.agentType);
                      }}
                    >
                      <td className="admin-table-name">
                        <span className="admin-agent-cell">
                          <span>{row.label}</span>
                          <span className="muted admin-agent-cell-desc">
                            {t[getAgentUI(row.agentType).descriptionKey]}
                          </span>
                        </span>
                      </td>
                      <td>
                        {row.accountantName ?? <span className="muted">—</span>}{' '}
                        <span className="muted" dir="ltr">
                          {row.accountantEmail}
                        </span>
                      </td>
                      <td>
                        {row.enabled ? (
                          <span className="badge badge-success">{t.activeBadge}</span>
                        ) : (
                          <span className="badge badge-neutral">{t.adminAgentDisabledBadge}</span>
                        )}
                      </td>
                      <td>{row.clientCount === 0 ? <span className="muted">—</span> : row.clientCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
