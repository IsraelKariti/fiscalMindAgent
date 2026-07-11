import type { AgentInstance } from '../api';
import { getAgentUI } from '../agents/registry';
import { useT } from '../i18n';

interface Props {
  agents: AgentInstance[];
  onSelectAgent: (agent: AgentInstance) => void;
  userEmail?: string | null;
  /** Absent in the monday iframe — identity belongs to monday, so there is nothing to log out of. */
  onLogout?: () => void;
}

/**
 * The top-level agent registry page: one card per enabled agent; picking one
 * swaps the whole working surface to that agent's workspace. Shown only when
 * the accountant has more than one agent — single-agent accounts land
 * straight in their workspace, as the app always has.
 */
export function AgentsHome({ agents, onSelectAgent, userEmail, onLogout }: Props) {
  const { t } = useT();
  return (
    <div className="agents-home">
      <div className="agents-home-header">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt={t.logoAlt} />
          <span>FiscalMind</span>
        </div>
        <h1>{t.agentsHomeTitle}</h1>
        <p className="muted">{t.agentsHomeHint}</p>
      </div>
      {agents.length === 0 ? (
        <div className="agents-home-empty muted">{t.agentsNoneEnabled}</div>
      ) : (
        <div className="agents-grid">
          {agents.map((agent) => {
            const ui = getAgentUI(agent.agentType);
            return (
              <button key={agent.id} className="card agent-card" onClick={() => onSelectAgent(agent)}>
                <span className="agent-card-icon">{ui.icon}</span>
                <span className="agent-card-text">
                  <span className="agent-card-name">{agent.name}</span>
                  <span className="agent-card-desc muted">{t[ui.descriptionKey]}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {onLogout && (
        <div className="agents-home-footer" title={t.googleAccountTitle}>
          <span className="avatar">{(userEmail?.[0] ?? '·').toUpperCase()}</span>
          <span className="muted" dir="ltr">{userEmail ?? '…'}</span>
          <button className="btn btn-ghost btn-small" onClick={onLogout}>
            {t.logout}
          </button>
        </div>
      )}
    </div>
  );
}
