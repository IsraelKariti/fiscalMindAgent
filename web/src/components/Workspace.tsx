import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { agentApi, api, type AccountTier, type AgentInstance, type Client, type MailboxStatus } from '../api';
import { WorkspaceApiProvider } from '../agents/ApiContext';
import { getAgentUI } from '../agents/registry';
import { AgentsHome } from './AgentsHome';
import { Sidebar } from './Sidebar';
import { ClientView } from './ClientView';
import { PromptSettings } from './PromptSettings';
import { AddClientModal } from './AddClientModal';
import { DeleteClientModal } from './DeleteClientModal';
import { Overview } from './Overview';
import { Settings } from './Settings';
import { useT } from '../i18n';

type View =
  | { kind: 'overview' }
  | { kind: 'client'; clientId: string }
  | { kind: 'prompt' }
  | { kind: 'settings' }
  | { kind: 'empty' };

interface Props {
  userEmail: string | null;
  tier: AccountTier | null;
  contactEmail: string | null;
  /** Set while an admin is impersonating (standalone only); enables the prompt-tuning view. */
  impersonatingEmail?: string | null;
  onStopImpersonating?: () => void;
  /** Absent in the monday iframe — identity belongs to monday, so there is nothing to log out of. */
  onLogout?: () => void;
  /**
   * monday surfaces only: renders the board→clients import inside a modal.
   * The shell owns the modal state and passes the refresh/close callbacks so
   * the import stays decoupled from the monday SDK this component must not know.
   */
  renderImportPanel?: (props: { onImported: () => void; onClose: () => void }) => ReactNode;
  /**
   * Locks the shell to one agent type (monday surfaces pin the doc collector):
   * no agents-home page and no switcher, whatever the account has enabled.
   */
  pinnedAgentType?: string;
}

/**
 * The signed-in accountant shell: sidebar, client views, dashboard, settings.
 * Auth-agnostic — rendered by the standalone SPA (session cookie) and by the
 * monday custom object (sessionToken transport); the host decides identity and
 * passes what the shell may show.
 */
export function Workspace({
  userEmail,
  tier,
  contactEmail,
  impersonatingEmail,
  onStopImpersonating,
  onLogout,
  renderImportPanel,
  pinnedAgentType,
}: Props) {
  const { t } = useT();
  const [agents, setAgents] = useState<AgentInstance[] | null>(null);
  const [agent, setAgent] = useState<AgentInstance | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Client | null>(null);

  // Which agent workspace this shell shows. A single instance (or a pinned
  // type) auto-enters it — same UX as before agents existed; with several,
  // the remembered one wins and no memory lands on the agents-home page.
  useEffect(() => {
    api
      .listAgents()
      .then(({ agents: list }) => {
        setAgents(list);
        if (pinnedAgentType) {
          setAgent(list.find((a) => a.agentType === pinnedAgentType) ?? list[0] ?? null);
          return;
        }
        if (list.length <= 1) {
          setAgent(list[0] ?? null);
          return;
        }
        const stored = sessionStorage.getItem('fm.lastAgentId');
        setAgent(list.find((a) => a.id === stored) ?? null);
      })
      .catch(console.error);
  }, [pinnedAgentType]);
  useEffect(() => {
    if (agent) sessionStorage.setItem('fm.lastAgentId', agent.id);
  }, [agent]);

  const enterAgent = (next: AgentInstance) => {
    setClients([]);
    setView({ kind: 'empty' });
    setAgent(next);
  };
  const showAgentsHome = () => {
    // Explicitly leaving an agent also forgets it, so a refresh lands back home.
    sessionStorage.removeItem('fm.lastAgentId');
    setClients([]);
    setView({ kind: 'empty' });
    setAgent(null);
  };

  const wsApi = useMemo(() => (agent ? agentApi(agent.id) : null), [agent]);
  const agentUI = getAgentUI(agent?.agentType ?? 'doc_collector');
  // Per-agent so switching agents restores each one's last viewed client.
  const lastClientKey = agent ? `fm.lastClientId.${agent.id}` : null;

  const loadClients = useCallback(async () => {
    if (!wsApi || !lastClientKey) return;
    const { clients: list } = await wsApi.listClients();
    setClients(list);
    setView((v) => {
      if (v.kind !== 'empty') return v;
      // Restore the screen viewed before a refresh: the dashboard, settings, or the client if it still exists.
      const lastView = sessionStorage.getItem('fm.lastView');
      if (lastView === 'overview') return { kind: 'overview' };
      if (lastView === 'settings') return { kind: 'settings' };
      const stored = sessionStorage.getItem(lastClientKey);
      const restored = stored && list.some((c) => c.id === stored) ? stored : list[0]?.id;
      return restored ? { kind: 'client', clientId: restored } : v;
    });
  }, [wsApi, lastClientKey]);

  useEffect(() => {
    if (view.kind === 'client' && lastClientKey) sessionStorage.setItem(lastClientKey, view.clientId);
    if (view.kind === 'client' || view.kind === 'overview' || view.kind === 'settings')
      sessionStorage.setItem('fm.lastView', view.kind);
  }, [view, lastClientKey]);

  useEffect(() => {
    loadClients().catch(console.error);
  }, [loadClients]);
  useEffect(() => {
    api.mailboxStatus().then(setMailbox).catch(console.error);
  }, []);

  const clientDeleted = (client: Client) => {
    setDeleting(null);
    const remaining = clients.filter((c) => c.id !== client.id);
    setClients(remaining);
    setView((v) =>
      v.kind === 'client' && v.clientId === client.id
        ? remaining[0]
          ? { kind: 'client', clientId: remaining[0].id }
          : { kind: 'empty' }
        : v,
    );
  };

  // Until the agent list arrives there is no workspace to scope requests to.
  if (!agents) {
    return <div className="screen-center muted">{t.loading}</div>;
  }
  // No active agent: the top-level registry page (multi-agent accounts only —
  // single-agent and pinned shells auto-enter above; empty accounts see the
  // none-enabled message inside).
  if (!agent || !wsApi) {
    return <AgentsHome agents={agents} onSelectAgent={enterAgent} userEmail={userEmail} onLogout={onLogout} />;
  }
  // Stub agent types have no workspace yet — a full-pane "coming soon" note
  // instead of the client shell.
  if (agentUI.comingSoon) {
    return (
      <div className="screen-center">
        <div className="card coming-soon-card">
          <span className="agent-card-icon">{agentUI.icon}</span>
          <h2>{agent.name}</h2>
          <p className="muted">{t[agentUI.descriptionKey]}</p>
          <p className="coming-soon-note">{t.agentComingSoon}</p>
          {!pinnedAgentType && agents.length > 1 && (
            <button className="btn btn-ghost" onClick={showAgentsHome}>
              {t.agentsHomeTitle}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <WorkspaceApiProvider value={wsApi}>
    <div className="app">
      <div className="layout">
        <Sidebar
          agentName={agent.name}
          agentIcon={agentUI.icon}
          onShowAgents={!pinnedAgentType && agents.length > 1 ? showAgentsHome : undefined}
          clients={clients}
          selectedClientId={view.kind === 'client' ? view.clientId : null}
          dashboardSelected={view.kind === 'overview'}
          promptSelected={view.kind === 'prompt'}
          settingsSelected={view.kind === 'settings'}
          onSelectClient={(clientId) => setView({ kind: 'client', clientId })}
          onSelectDashboard={() => setView({ kind: 'overview' })}
          onSelectPrompt={() => setView({ kind: 'prompt' })}
          onSelectSettings={() => setView({ kind: 'settings' })}
          onAddClient={agentUI.inboundOnlyClients ? undefined : () => setAdding(true)}
          // Inbound-only agents are goal-less; their client dot shows the mute state instead.
          muteDots={agentUI.inboundOnlyClients}
          // The board→clients import is doc-collector behavior — agents that
          // connect monday differently (customer service: settings panel)
          // must not offer it, or their imports land in the wrong instance.
          onImportClients={renderImportPanel && agentUI.supportsBoardImport ? () => setImporting(true) : undefined}
          onDeleteClient={setDeleting}
          userEmail={userEmail}
          tier={tier}
          impersonatingEmail={impersonatingEmail ?? null}
          onStopImpersonating={onStopImpersonating}
          onLogout={onLogout}
        />
        <main className="main">
          {view.kind === 'overview' && (
            <Overview onSelectClient={(clientId) => setView({ kind: 'client', clientId })} />
          )}
          {view.kind === 'client' && (
            <ClientView
              key={view.clientId}
              clientId={view.clientId}
              agentUI={agentUI}
              onClientUpdated={loadClients}
            />
          )}
          {view.kind === 'prompt' && impersonatingEmail && <PromptSettings />}
          {view.kind === 'settings' && (
            <Settings
              mailbox={mailbox}
              tier={tier}
              contactEmail={contactEmail}
              agentPanel={agentUI.settingsPanel?.()}
              agentPanelTabKey={agentUI.settingsPanelTabKey}
              hideMailbox={!agentUI.channels.includes('email')}
            />
          )}
          {view.kind === 'empty' && (
            <div className="screen-center muted">
              {agentUI.inboundOnlyClients ? t.noClientsInboundWa : t.noClientsUseAdd}
            </div>
          )}
        </main>
      </div>
      {deleting && (
        <DeleteClientModal client={deleting} onClose={() => setDeleting(null)} onDeleted={clientDeleted} />
      )}
      {adding && (
        <AddClientModal
          simple={agentUI.simpleClientForm}
          leadKey={agentUI.addClientLeadKey}
          onClose={() => setAdding(false)}
          onCreated={(client) => {
            setAdding(false);
            setView({ kind: 'client', clientId: client.id });
            loadClients().catch(console.error);
          }}
        />
      )}
      {importing && renderImportPanel &&
        // Portaled to <body> like the modal components: ancestors with
        // backdrop-filter/transforms re-anchor position:fixed away from the viewport.
        createPortal(
          <div className="modal-backdrop" onClick={() => setImporting(false)}>
            <div className="card modal modal-import" onClick={(e) => e.stopPropagation()}>
              {renderImportPanel({
                onImported: () => loadClients().catch(console.error),
                onClose: () => setImporting(false),
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
    </WorkspaceApiProvider>
  );
}
