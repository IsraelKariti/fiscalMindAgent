import type { AccountTier, Client } from '../api';
import { useT } from '../i18n';

interface Props {
  /** The active agent's display name, shown in the switcher row. */
  agentName?: string | null;
  /** Multi-agent accounts only: navigates back to the agents-home page; the row hides when absent. */
  onShowAgents?: () => void;
  clients: Client[];
  selectedClientId: string | null;
  dashboardSelected: boolean;
  promptSelected: boolean;
  settingsSelected: boolean;
  onSelectClient: (clientId: string) => void;
  onSelectDashboard: () => void;
  onSelectPrompt: () => void;
  onSelectSettings: () => void;
  onAddClient: () => void;
  onDeleteClient: (client: Client) => void;
  userEmail: string | null;
  /** Tier of the workspace being viewed (the impersonated accountant's while impersonating). */
  tier: AccountTier | null;
  impersonatingEmail: string | null;
  onStopImpersonating?: () => void;
  /** Absent in the monday iframe, where the identity is monday's — the logout button hides. */
  onLogout?: () => void;
  /** monday surfaces only: opens the board→clients import; the button hides when absent. */
  onImportClients?: () => void;
}

const icon = {
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  ),
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  sliders: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  gear: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eye: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  sparkles: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </svg>
  ),
  grid: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
};

export function Sidebar({
  agentName,
  onShowAgents,
  clients,
  selectedClientId,
  dashboardSelected,
  promptSelected,
  settingsSelected,
  onSelectClient,
  onSelectDashboard,
  onSelectPrompt,
  onSelectSettings,
  onAddClient,
  onDeleteClient,
  userEmail,
  tier,
  impersonatingEmail,
  onStopImpersonating,
  onLogout,
  onImportClients,
}: Props) {
  const { t } = useT();
  return (
    <nav className="sidebar">
      <div className="brand sidebar-brand">
        <img className="brand-mark" src="/petal-seal.svg" alt={t.logoAlt} />
        <span>FiscalMind</span>
      </div>

      <div className="sidebar-scroll">
        {/* Multi-agent accounts: which agent this workspace is, + the way back to all of them. */}
        {onShowAgents && (
          <button className="client-item sidebar-nav-item agent-switcher" onClick={onShowAgents} title={t.allAgents}>
            <span className="nav-item-icon">{icon.grid}</span>
            <span className="client-item-text">
              <span className="client-item-name">{agentName}</span>
              <span className="client-item-email muted">{t.allAgents}</span>
            </span>
          </button>
        )}
        <button
          className={`client-item sidebar-nav-item ${dashboardSelected ? 'selected' : ''}`}
          onClick={onSelectDashboard}
        >
          <span className="nav-item-icon">{icon.dashboard}</span>
          <span className="client-item-name">{t.navDashboard}</span>
        </button>

        <div className="side-heading">
          <span className="side-heading-label">
            {t.clientsHeading}
            {clients.length > 0 && <span className="side-count">{clients.length}</span>}
          </span>
          <span className="side-heading-rule" />
          {onImportClients && (
            <button className="icon-btn" onClick={onImportClients} title={t.mwImportOpen}>
              {icon.download}
            </button>
          )}
          <button className="icon-btn" onClick={onAddClient} title={t.addClient}>
            {icon.plus}
          </button>
        </div>
        <ul className="client-list">
          {clients.map((client) => (
            <li key={client.id} className="client-row">
              <button
                className={`client-item ${client.id === selectedClientId ? 'selected' : ''}`}
                onClick={() => onSelectClient(client.id)}
              >
                <span
                  className={`status-dot ${client.goal_status}`}
                  title={client.goal_status === 'complete' ? t.goalCompleteTitle : t.goalPendingTitle}
                />
                <span className="client-item-text">
                  <span className="client-item-name">{client.name}</span>
                  <span className="client-item-email muted" dir="ltr">{client.email_address}</span>
                </span>
              </button>
              <button
                className="client-delete"
                title={t.deleteClientAction(client.name)}
                onClick={() => onDeleteClient(client)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </li>
          ))}
          {clients.length === 0 && <li className="muted sidebar-empty">{t.sidebarNoClients}</li>}
        </ul>

        {/* Prompt tuning is an admin task — surfaced only inside an impersonated workspace. */}
        {impersonatingEmail && (
          <>
            <div className="side-heading">
              <span className="side-heading-label">{t.adminTools}</span>
              <span className="side-heading-rule" />
            </div>
            <button className={`client-item ${promptSelected ? 'selected' : ''}`} onClick={onSelectPrompt}>
              <span className="nav-item-icon">{icon.sliders}</span>
              <span className="client-item-name">{t.systemPrompt}</span>
            </button>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        {tier === 'normal' && (
          <button className="client-item sidebar-upgrade" onClick={onSelectSettings}>
            <span className="nav-item-icon">{icon.sparkles}</span>
            <span className="client-item-name">{t.upgradeToPremium}</span>
          </button>
        )}
        <button
          className={`client-item ${settingsSelected ? 'selected' : ''}`}
          onClick={onSelectSettings}
        >
          <span className="nav-item-icon">{icon.gear}</span>
          <span className="client-item-name">{t.settings}</span>
        </button>
        {impersonatingEmail && (
          <div className="id-card impersonation-card" title={t.impersonationTitle}>
            <span className="id-card-icon">{icon.eye}</span>
            <span className="id-card-text">
              <span className="microlabel">{t.viewingAs}</span>
              <span className="id-card-value id-card-email" dir="ltr">{impersonatingEmail}</span>
            </span>
            <button className="btn btn-ghost btn-small" onClick={onStopImpersonating}>
              {t.exitImpersonation}
            </button>
          </div>
        )}
        <div className="account-row" title={t.googleAccountTitle}>
          <span className="avatar">{(userEmail?.[0] ?? '·').toUpperCase()}</span>
          <span className="id-card-text">
            {/* The account row shows the real signed-in user, so the tier chip
                hides while impersonating (the tier is the impersonated one's). */}
            {tier === 'premium' && !impersonatingEmail && (
              <span className="microlabel tier-chip-premium">{t.tierPremium}</span>
            )}
            <span className="id-card-value id-card-email" dir="ltr">{userEmail ?? '…'}</span>
          </span>
          {onLogout && (
            <button className="icon-btn" onClick={onLogout} title={t.logout}>
              {icon.logout}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
