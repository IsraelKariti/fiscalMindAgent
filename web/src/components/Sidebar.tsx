import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Client } from '../api';
import { advisorKeyOf, advisorOptionsOf, clientDotClass, clientDotState, clientMatchesQuery, contactLabel, countByDotColor, displayClientName, dotColorOf, formatTimestamp, formatUsd, isAdvisedBy, isAssignedTo, isDeclined, isOverdueStopped, type AdvisorChoice, type DotFilter } from '../format';
import { dotTitle, useT } from '../i18n';
import { Dropdown } from './Dropdown';

/**
 * Admin roster cost (openspec `admin-roster-cost`): the shared formatter prints
 * 0 as "$0.0000", which reads as noise in a roster — a client with no spend
 * shows a plain "$0".
 */
function formatRosterCost(cost: number): string {
  return cost > 0 ? formatUsd(cost) : '$0';
}

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
  settingsSelected: boolean;
  onSelectClient: (clientId: string) => void;
  onSelectSettings: () => void;
  /** Absent for inbound-only agents, whose clients enroll themselves — the + button hides. */
  onAddClient?: () => void;
  /** Absent for a staff viewer (read-only) — the per-row delete button hides. */
  onDeleteClient?: (client: Client) => void;
  /**
   * Admin view-as only (openspec `soft-delete-clients`): the "deleted clients"
   * toggle. Absent for the accountant's own session — the toggle never renders.
   */
  showDeleted?: boolean;
  onToggleShowDeleted?: (on: boolean) => void;
  /** A staff viewer's session (openspec `client-search`): the "my clients only" checkbox opens ticked. */
  viewer?: boolean;
  userEmail: string | null;
  impersonatingEmail: string | null;
  onStopImpersonating?: () => void;
  /** Absent in the monday iframe, where the identity is monday's — the logout button hides. */
  onLogout?: () => void;
}

const icon = {
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
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
  user: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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
  settingsSelected,
  onSelectClient,
  onSelectSettings,
  onAddClient,
  onDeleteClient,
  showDeleted = false,
  onToggleShowDeleted,
  viewer = false,
  userEmail,
  impersonatingEmail,
  onStopImpersonating,
  onLogout,
}: Props) {
  const { t } = useT();
  const [clientQuery, setClientQuery] = useState('');
  // The status control (openspec `client-search`): one pressed button, 'all' on load, not kept across reloads.
  const [statusFilter, setStatusFilter] = useState<DotFilter>('all');
  // The tax advisor picker (openspec `client-search`): 'all', 'me' or one
  // advisor's key. Opens on 'me' for a staff viewer, 'all' for everybody else;
  // not kept across reloads. `advisorPicked` = the person chose by hand.
  const [advisorChoice, setAdvisorChoice] = useState<AdvisorChoice>(viewer ? 'me' : 'all');
  const [advisorPicked, setAdvisorPicked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const canSwitchAgent = Boolean(onSwitchAgent && agentOptions && agentOptions.length > 1);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);
  // Matches what the accountant sees in the list: name, email, and the
  // contact label (phone for WhatsApp-only clients with a synthetic mailbox).
  // Same rule as the overview list (openspec `client-status-indicator`).
  const dotStateOf = (client: Client) =>
    clientDotState({ goal_status: client.goal_status, overdueStopped: isOverdueStopped(client), declined: isDeclined(client) });
  const dotFor = (client: Client) => {
    const state = dotStateOf(client);
    return { cls: clientDotClass(state), title: dotTitle(t, state) };
  };
  // "Me" for the picker: the signed-in person, or the accountant being viewed
  // under admin view-as (the admin sees what the accountant sees).
  const meEmail = impersonatingEmail ?? userEmail;
  const assignedCount = useMemo(() => clients.filter((client) => isAssignedTo(client, meEmail)).length, [clients, meEmail]);
  const hasAdvisors = useMemo(() => clients.some((client) => advisorKeyOf(client) !== ''), [clients]);
  const otherAdvisors = useMemo(() => advisorOptionsOf(clients, meEmail), [clients, meEmail]);
  // The choice in effect is derived, never reset: an advisor who left the
  // loaded list counts as 'all', and so does the opening 'me' of a viewer with
  // no own clients. A 'me' picked by hand stays, even with no own clients.
  const advisorInEffect: AdvisorChoice = !hasAdvisors
    ? 'all'
    : advisorChoice === 'me'
      ? advisorPicked || assignedCount > 0
        ? 'me'
        : 'all'
      : advisorChoice === 'all' || otherAdvisors.some((advisor) => advisor.key === advisorChoice)
        ? advisorChoice
        : 'all';
  const advisorPickerOptions = useMemo(
    () => [
      { value: 'all', label: t.sidebarAdvisorAll },
      { value: 'me', label: t.sidebarAdvisorMe },
      ...otherAdvisors.map((advisor) => ({ value: advisor.key, label: advisor.name })),
    ],
    [otherAdvisors, t],
  );
  const advisorButtonText =
    advisorInEffect === 'all'
      ? t.sidebarAdvisorAllButton
      : advisorInEffect === 'me'
        ? t.sidebarMyClientsToggle
        : (otherAdvisors.find((advisor) => advisor.key === advisorInEffect)?.name ?? t.sidebarAdvisorAllButton);
  // "Questions from the agent" (openspec `team-questions`): every client with an
  // open question, whoever it is addressed to — the same clients that carry the
  // row badge. Composes with the tax advisor picker: the picked advisor's
  // clients with an open question. Hidden when no client has one.
  const [forMeOnly, setForMeOnly] = useState(false);
  const forMeCount = useMemo(() => clients.filter((client) => Boolean(client.openTeamQuestion)).length, [clients]);
  const forMeActive = forMeOnly && forMeCount > 0;
  const baseClients = useMemo(
    () =>
      clients.filter(
        (client) => isAdvisedBy(client, advisorInEffect, meEmail) && (!forMeActive || Boolean(client.openTeamQuestion)),
      ),
    [clients, advisorInEffect, forMeActive, meEmail],
  );
  // Counts describe the loaded list (live or deleted, narrowed by the tax advisor picker), never the search result.
  const statusCounts = useMemo(() => countByDotColor(baseClients.map(dotStateOf)), [baseClients]);
  const visibleClients = useMemo(() => {
    // Status control and search narrow together; name, contact or office file number (openspec `client-search`).
    return baseClients.filter(
      (client) => (statusFilter === 'all' || dotColorOf(dotStateOf(client)) === statusFilter) && clientMatchesQuery(client, clientQuery),
    );
  }, [baseClients, clientQuery, statusFilter]);
  const STATUS_BUTTONS: { key: DotFilter; dot: string | null }[] = [
    { key: 'all', dot: null },
    { key: 'blue', dot: 'in-progress' },
    { key: 'green', dot: 'done' },
    { key: 'orange', dot: 'window-ended' },
    { key: 'red', dot: 'refused' },
  ];
  return (
    <nav className="sidebar">
      <div className="sidebar-scroll">
        <div className="side-heading">
          {onAddClient && !showDeleted && (
            <>
              <span className="side-heading-rule" />
              <button className="icon-btn" onClick={onAddClient} title={t.addClient}>
                {icon.plus}
              </button>
            </>
          )}
        </div>
        {onToggleShowDeleted && (
          <label className="muted sidebar-deleted-toggle" title={t.sidebarDeletedToggleTitle}>
            <input type="checkbox" checked={showDeleted} onChange={(e) => onToggleShowDeleted(e.target.checked)} />
            {t.sidebarDeletedToggle}
          </label>
        )}
        {(hasAdvisors || forMeCount > 0) && (
          // Two equal columns; a control shown alone keeps its own half (openspec `client-search`, `team-questions`).
          <div className="sidebar-filter-toggles">
            {hasAdvisors && (
              <Dropdown
                className="sidebar-advisor-picker"
                triggerClassName={`sidebar-filter-toggle ${advisorInEffect !== 'all' ? 'is-active' : ''}`}
                title={t.sidebarMyClientsToggleTitle}
                listMinWidth={200}
                value={advisorInEffect}
                options={advisorPickerOptions}
                onChange={(choice) => {
                  setAdvisorChoice(choice);
                  setAdvisorPicked(true);
                }}
                triggerContent={
                  <>
                    <span className="sidebar-filter-toggle-icon" aria-hidden="true">
                      {icon.user}
                    </span>
                    <span className="sidebar-filter-toggle-text">{advisorButtonText}</span>
                  </>
                }
              />
            )}
            {forMeCount > 0 && (
              <button
                type="button"
                className={`sidebar-filter-toggle sidebar-filter-toggle-questions ${forMeActive ? 'is-active' : ''}`}
                aria-pressed={forMeActive}
                title={t.sidebarQuestionsForMeTitle}
                onClick={() => setForMeOnly((on) => !on)}
              >
                <span className="client-item-question-badge" aria-hidden="true">
                  {t.clientOpenQuestionBadge}
                </span>
                <span className="sidebar-filter-toggle-text">{t.sidebarQuestionsForMe}</span>
              </button>
            )}
          </div>
        )}
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
        {clients.length > 0 && (
          <div className="status-filter" role="radiogroup" aria-label={t.statusFilterLabel}>
            {STATUS_BUTTONS.map(({ key, dot }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={statusFilter === key}
                className={`status-filter-btn ${statusFilter === key ? 'is-active' : ''}`}
                title={t.statusFilterTitles[key]}
                onClick={() => setStatusFilter(key)}
              >
                {dot ? <span className={`status-dot status-filter-dot ${dot}`} /> : <span>{t.statusFilterAll}</span>}
                <span className="status-filter-count">{statusCounts[key]}</span>
              </button>
            ))}
          </div>
        )}
        <ul className="client-list">
          {visibleClients.map((client) => {
            const dot = dotFor(client);
            return (
              <li key={client.id} className="client-row">
                <button
                  className={`client-item ${client.id === selectedClientId ? 'selected' : ''}${client.isTest ? ' client-item-test' : ''}`}
                  onClick={() => onSelectClient(client.id)}
                >
                  <span className={`status-dot ${dot.cls}`} title={dot.title} />
                  <span className="client-item-text">
                    <span className="client-item-name">
                      <span className="client-item-name-text">{displayClientName(client.name)}</span>
                      {client.openTeamQuestion && (
                        <span className="client-item-question-badge" title={t.clientOpenQuestionBadgeTitle(client.openTeamQuestion.toName)}>
                          {t.clientOpenQuestionBadge}
                        </span>
                      )}
                      {client.isTest && (
                        <span className="admin-chip client-item-test-badge" title={t.testClientBadgeTitle}>
                          {t.testClientBadge}
                        </span>
                      )}
                      {client.cost !== undefined && (
                        <span className="client-item-cost" dir="ltr" title={t.rosterCostTitle}>
                          {formatRosterCost(client.cost)}
                        </span>
                      )}
                    </span>
                    <span className="client-item-email muted" dir="ltr">
                      {/* Inner wrapper slides on hover when the line is wider than the
                          sidebar, so the whole phone + file number can be read. */}
                      <span className="client-item-email-inner">
                        {contactLabel(client)}
                        {client.agent_fields?.file_number && (
                          <span className="client-item-file" title={t.fileNumberChipTitle}>
                            {t.fileNumberChip(client.agent_fields.file_number)}
                          </span>
                        )}
                      </span>
                    </span>
                    {client.deletedAt && (
                      <span className="client-item-deleted muted">{t.deletedOn(formatTimestamp(client.deletedAt))}</span>
                    )}
                  </span>
                </button>
                {!client.deletedAt && onDeleteClient && (
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
                )}
              </li>
            );
          })}
          {clients.length === 0 && (
            <li className="muted sidebar-empty">{showDeleted ? t.sidebarNoDeleted : t.sidebarNoClients}</li>
          )}
          {clients.length > 0 && visibleClients.length === 0 && (
            <li className="muted sidebar-empty">{t.sidebarNoMatches}</li>
          )}
        </ul>

      </div>

      {/* The account menu (openspec `sidebar-account-menu`): brand, agent,
          viewing-as, settings and logout all live behind the email row. */}
      <div className="sidebar-footer">
        <div className="account-menu-wrap" ref={menuWrapRef}>
          {menuOpen && (
            <div className="account-menu" role="menu">
              <div className="brand account-menu-brand">
                <img className="brand-mark" src="/petal-seal.svg" alt={t.logoAlt} />
                <span>FiscalMind</span>
              </div>
              {canSwitchAgent
                ? agentOptions!.map((option) => (
                    <button
                      key={option.id}
                      className="account-menu-item"
                      role="menuitemradio"
                      aria-checked={option.id === activeAgentId}
                      title={t.switchAgentTitle}
                      onClick={() => {
                        setMenuOpen(false);
                        if (option.id !== activeAgentId) onSwitchAgent!(option.id);
                      }}
                    >
                      <span className="agent-menu-icon">{option.icon}</span>
                      <span className="client-item-name">{option.name}</span>
                      {option.id === activeAgentId && <span className="agent-menu-check">{icon.check}</span>}
                    </button>
                  ))
                : agentName && (
                    <div className="account-menu-agent">
                      <span className="agent-menu-icon">{agentIcon}</span>
                      <span className="client-item-name">{agentName}</span>
                    </div>
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
              <div className="account-menu-divider" />
              <button
                className={`account-menu-item ${settingsSelected ? 'is-selected' : ''}`}
                role="menuitem"
                aria-current={settingsSelected ? 'page' : undefined}
                onClick={() => {
                  setMenuOpen(false);
                  onSelectSettings();
                }}
              >
                <span className="nav-item-icon">{icon.gear}</span>
                <span>{t.settings}</span>
              </button>
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
              {onLogout && (
                <button
                  className="account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  <span className="nav-item-icon">{icon.logout}</span>
                  <span>{t.logout}</span>
                </button>
              )}
            </div>
          )}
          <button
            className="account-row account-row-btn"
            title={t.accountMenuTitle}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <img className="account-row-logo" src="/petal-seal.svg" alt={t.logoAlt} />
            <span className="id-card-text">
              <span className="id-card-value id-card-email" dir="ltr">{userEmail ?? '…'}</span>
            </span>
            <span className="account-row-chevron">{icon.chevronsUpDown}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
