import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Client } from '../api';
import { contactLabel, displayClientName, isOverdueStopped } from '../format';
import { useT } from '../i18n';

export interface AgentOption {
  id: string;
  name: string;
  icon: ReactNode;
}

interface Props {
  /** The active agent's display name, shown in the identity header. */
  agentName?: string | null;
  /** The active agent type's icon, shown next to the name in the identity header. */
  agentIcon?: ReactNode;
  /**
   * Multi-agent accounts only: every enabled agent, shown in a dropdown opened
   * from the identity header. The header stays a plain label when absent.
   */
  agentOptions?: AgentOption[];
  activeAgentId?: string;
  onSwitchAgent?: (agentId: string) => void;
  /** Multi-agent accounts only: navigates back to the agents-home page; the account-menu item hides when absent. */
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
  /** Absent for inbound-only agents, whose clients enroll themselves — the + button hides. */
  onAddClient?: () => void;
  /**
   * Inbound-only agents have no goal to track, so the client dot shows the
   * mute state instead: green while the agent answers, red while muted.
   */
  muteDots?: boolean;
  onDeleteClient: (client: Client) => void;
  userEmail: string | null;
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
  grid: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  chevronsUpDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  ),
  chevronDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

export function Sidebar({
  agentName,
  agentIcon,
  agentOptions,
  activeAgentId,
  onSwitchAgent,
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
  muteDots,
  onDeleteClient,
  userEmail,
  impersonatingEmail,
  onStopImpersonating,
  onLogout,
  onImportClients,
}: Props) {
  const { t } = useT();
  const [clientQuery, setClientQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherWrapRef = useRef<HTMLDivElement>(null);
  const hasAccountMenu = Boolean(onShowAgents);
  const canSwitchAgent = Boolean(onSwitchAgent && agentOptions && agentOptions.length > 1);
  useEffect(() => {
    if (!menuOpen && !switcherOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
      if (!switcherWrapRef.current?.contains(e.target as Node)) setSwitcherOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, switcherOpen]);
  // Matches what the accountant sees in the list: name, email, and the
  // contact label (phone for WhatsApp-only clients with a synthetic mailbox).
  const visibleClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(q) ||
        client.email_address.toLowerCase().includes(q) ||
        contactLabel(client).toLowerCase().includes(q),
    );
  }, [clients, clientQuery]);
  const dotFor = (client: Client) =>
    muteDots
      ? client.wa_enabled
        ? { cls: 'complete', title: t.muteStatusAnswering }
        : { cls: 'wa-muted', title: t.muteStatusMuted }
      : isOverdueStopped(client)
        ? { cls: 'overdue', title: t.goalOverdueTitle }
        : {
            cls: client.goal_status,
            title: client.goal_status === 'complete' ? t.goalCompleteTitle : t.goalPendingTitle,
          };
  return (
    <nav className="sidebar">
      <div className="brand sidebar-brand">
        <img className="brand-mark" src="/petal-seal.svg" alt={t.logoAlt} />
        <span>FiscalMind</span>
      </div>

      <div className="sidebar-scroll">
        {/* Identity header — on multi-agent accounts it opens the agent-switch dropdown. */}
        {agentName && (
          <div className="agent-switch-wrap" ref={switcherWrapRef}>
            {canSwitchAgent ? (
              <button
                className="agent-identity agent-identity-btn"
                title={t.switchAgentTitle}
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
                onClick={() => setSwitcherOpen((open) => !open)}
              >
                <span className="agent-identity-icon">{agentIcon}</span>
                <span className="client-item-name">{agentName}</span>
                <span className="agent-switch-chevron">{icon.chevronDown}</span>
              </button>
            ) : (
              <div className="agent-identity">
                <span className="agent-identity-icon">{agentIcon}</span>
                <span className="client-item-name">{agentName}</span>
              </div>
            )}
            {switcherOpen && (
              <div className="account-menu agent-switch-menu" role="menu">
                {agentOptions!.map((option) => (
                  <button
                    key={option.id}
                    className="account-menu-item"
                    role="menuitemradio"
                    aria-checked={option.id === activeAgentId}
                    onClick={() => {
                      setSwitcherOpen(false);
                      if (option.id !== activeAgentId) onSwitchAgent!(option.id);
                    }}
                  >
                    <span className="agent-menu-icon">{option.icon}</span>
                    <span className="client-item-name">{option.name}</span>
                    {option.id === activeAgentId && (
                      <span className="agent-menu-check">{icon.check}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
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
          {onAddClient && (
            <button className="icon-btn" onClick={onAddClient} title={t.addClient}>
              {icon.plus}
            </button>
          )}
        </div>
        {clients.length > 0 && (
          <input
            type="search"
            className="sidebar-search"
            placeholder={t.sidebarSearchPlaceholder}
            aria-label={t.sidebarSearchPlaceholder}
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
          />
        )}
        <ul className="client-list">
          {visibleClients.map((client) => {
            const dot = dotFor(client);
            return (
              <li key={client.id} className="client-row">
                <button
                  className={`client-item ${client.id === selectedClientId ? 'selected' : ''}`}
                  onClick={() => onSelectClient(client.id)}
                >
                  <span className={`status-dot ${dot.cls}`} title={dot.title} />
                  <span className="client-item-text">
                    <span className="client-item-name">{displayClientName(client.name)}</span>
                    <span className="client-item-email muted" dir="ltr">{contactLabel(client)}</span>
                  </span>
                </button>
                <button
                  className="client-delete"
                  title={t.deleteClientAction(displayClientName(client.name))}
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
            );
          })}
          {clients.length === 0 && <li className="muted sidebar-empty">{t.sidebarNoClients}</li>}
          {clients.length > 0 && visibleClients.length === 0 && (
            <li className="muted sidebar-empty">{t.sidebarNoMatches}</li>
          )}
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
        <button
          className={`client-item ${settingsSelected ? 'selected' : ''}`}
          onClick={onSelectSettings}
        >
          <span className="nav-item-icon">{icon.gear}</span>
          <span className="client-item-name">{t.settings}</span>
        </button>
        {onLogout && (
          <button className="client-item" onClick={onLogout}>
            <span className="nav-item-icon">{icon.logout}</span>
            <span className="client-item-name">{t.logout}</span>
          </button>
        )}
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
        <div className="account-menu-wrap" ref={menuWrapRef}>
          {menuOpen && (
            <div className="account-menu" role="menu">
              {onShowAgents && (
                <button
                  className="account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onShowAgents();
                  }}
                >
                  <span className="nav-item-icon">{icon.grid}</span>
                  <span>{t.agentsHomeTitle}</span>
                </button>
              )}
            </div>
          )}
          {hasAccountMenu ? (
            <button
              className="account-row account-row-btn"
              title={t.accountMenuTitle}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="avatar">{(userEmail?.[0] ?? '·').toUpperCase()}</span>
              <span className="id-card-text">
                <span className="id-card-value id-card-email" dir="ltr">{userEmail ?? '…'}</span>
              </span>
              <span className="account-row-chevron">{icon.chevronsUpDown}</span>
            </button>
          ) : (
            <div className="account-row" title={t.googleAccountTitle}>
              <span className="avatar">{(userEmail?.[0] ?? '·').toUpperCase()}</span>
              <span className="id-card-text">
                <span className="id-card-value id-card-email" dir="ltr">{userEmail ?? '…'}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
