import { useMemo } from 'react';
import type { Accountant } from '../../api';
import { getAllAgentUIs } from '../../agents/registry';
import { useT } from '../../i18n';

interface Props {
  accountants: Accountant[];
}

/**
 * The platform's agent catalog: one row per registered agent type — live or
 * coming soon — with adoption aggregates (active instances, clients) across
 * all accountants. Per-instance detail stays on the accountant pages.
 */
export function AdminAgents({ accountants }: Props) {
  const { t } = useT();
  const types = getAllAgentUIs();

  // agentType → adoption across the roster (enabled instances only).
  const adoption = useMemo(() => {
    const byType = new Map<string, { activeInstances: number; clients: number }>();
    for (const accountant of accountants) {
      for (const agent of accountant.agents) {
        if (!agent.enabled) continue;
        const entry = byType.get(agent.agentType) ?? { activeInstances: 0, clients: 0 };
        entry.activeInstances += 1;
        entry.clients += agent.clientCount;
        byType.set(agent.agentType, entry);
      }
    }
    return byType;
  }, [accountants]);

  return (
    <section className="card admin-roster">
      <div className="card-header">
        <div className="card-title-row">
          <h2>{t.adminAgentsTitle}</h2>
          <span className="badge badge-neutral">{t.nAgentTypes(types.length)}</span>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-col-name">{t.adminAgentColumn}</th>
              <th>{t.adminStatusLabel}</th>
              <th>{t.adminActiveAgentsLabel}</th>
              <th>{t.clientsLabel}</th>
            </tr>
          </thead>
          <tbody>
            {types.map((ui) => {
              const stats = adoption.get(ui.agentType);
              return (
                <tr key={ui.agentType}>
                  <td className="admin-table-name">
                    <span className="admin-agent-cell">
                      <span className="admin-agent-cell-title">
                        <span className="admin-agent-cell-icon">{ui.icon}</span>
                        {t[ui.nameKey]}
                      </span>
                      <span className="muted admin-agent-cell-desc">{t[ui.descriptionKey]}</span>
                    </span>
                  </td>
                  <td>
                    {ui.comingSoon ? (
                      <span className="badge badge-neutral">{t.comingSoonBadge}</span>
                    ) : (
                      <span className="badge badge-success">{t.adminAgentTypeAvailable}</span>
                    )}
                  </td>
                  <td>{stats ? stats.activeInstances : <span className="muted">—</span>}</td>
                  <td>{stats && stats.clients > 0 ? stats.clients : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
