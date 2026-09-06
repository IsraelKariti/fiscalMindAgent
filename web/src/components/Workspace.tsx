import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { agentApi, api, type AgentInstance, type Client, type MailboxStatus } from '../api';
import { ClientsRefreshProvider, WorkspaceApiProvider } from '../agents/ApiContext';
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
import { useWorkspaceRoute } from './workspaceRoute';

interface Props {
  userEmail: string | null;
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
  /**
   * Standalone SPA only: keep the workspace position (agent + client) in the
   * URL hash so it is shareable/deep-linkable. monday surfaces leave it off —
   * the iframe URL belongs to monday — and navigate in memory.
   */
  hashRouting?: boolean;
}

/**
 * The signed-in accountant shell: sidebar, client views, dashboard, settings.
 * Auth-agnostic — rendered by the standalone SPA (session cookie) and by the
 * monday custom object (sessionToken transport); the host decides identity and
 * passes what the shell may show.
 */
export function Workspace({
  userEmail,
  impersonatingEmail,
  onStopImpersonating,
  onLogout,
  renderImportPanel,
  pinnedAgentType,
  hashRouting,
}: Props) {
  const { t } = useT();
  const [agents, setAgents] = useState<AgentInstance[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Client | null>(null);

  // Which agent workspace this shell shows and which view is open, driven by
  // the route (URL hash on standalone, in-memory on monday — workspaceRoute.ts).
  // Impersonation prefixes /as/:email so the link names whose workspace it is.
  const hashBase = useMemo(
    () => (hashRouting ? (impersonatingEmail ? ['as', impersonatingEmail] : []) : null),
    [hashRouting, impersonatingEmail],
  );
  const [route, navigate, replaceRoute] = useWorkspaceRoute(hashBase);
  // Callbacks that outlive a render (loadClients) read the route through this.
  const routeRef = useRef(route);
  routeRef.current = route;
  const agentId = 'agentId' in route ? route.agentId : null;
  const agent = (agentId && agents?.find((a) => a.id === agentId)) || null;

  useEffect(() => {
    api
      .listAgents()
      .then(({ agents: list }) => setAgents(list))
      .catch(console.error);
  }, []);

  // Boot (or a link to an agent this account doesn't have) auto-enters one —
  // the pinned type, the remembered one, else the doc collector (the product's
  // core agent), else the first. The agents-home grid is never a landing page;
  // multi-agent accounts reach it only via the sidebar's "my agents" item.
  useEffect(() => {
    if (!agents) return;
    if (route.kind !== 'boot' && (!agentId || agents.some((a) => a.id === agentId))) return;
    const pick = pinnedAgentType
      ? (agents.find((a) => a.agentType === pinnedAgentType) ?? agents[0] ?? null)
      : (agents.find((a) => a.id === sessionStorage.getItem('fm.lastAgentId')) ??
        agents.find((a) => a.agentType === 'doc_collector') ??
        agents[0] ??
        null);
    replaceRoute(pick ? { kind: 'agent', agentId: pick.id } : { kind: 'home' });
  }, [agents, route.kind, agentId, pinnedAgentType, replaceRoute]);
  useEffect(() => {
    if (agent) sessionStorage.setItem('fm.lastAgentId', agent.id);
  }, [agent]);
  // Entering another agent drops the previous roster while the new one loads.
  useEffect(() => {
    setClients([]);
  }, [agentId]);

  const enterAgent = (next: AgentInstance) => {
    navigate({ kind: 'agent', agentId: next.id });
  };
  const showAgentsHome = () => {
    // Explicitly leaving an agent also forgets it — a refresh from here boots
    // into the default (doc collector) rather than the forgotten agent.
    sessionStorage.removeItem('fm.lastAgentId');
    navigate({ kind: 'home' });
  };

  const wsApi = useMemo(() => (agent ? agentApi(agent.id) : null), [agent]);
  const agentUI = getAgentUI(agent?.agentType ?? 'doc_collector');
  // Per-agent so switching agents restores each one's last viewed client.
  const lastClientKey = agent ? `fm.lastClientId.${agent.id}` : null;

  const loadClients = useCallback(async () => {
    if (!wsApi || !lastClientKey) return;
    const { clients: list } = await wsApi.listClients();
    setClients(list);
    // An agent-level route — and a link to a client that no longer exists —
    // resolves to the screen viewed before a refresh: settings (which owns the
    // dashboard tab) or the last client if it still exists. 'overview' is the
    // pre-merge name for the dashboard — map it to its new home.
    const current = routeRef.current;
    if (current.kind !== 'agent' && current.kind !== 'client') return;
    if (current.kind === 'client' && list.some((c) => c.id === current.clientId)) return;
    const lastView = sessionStorage.getItem('fm.lastView');
    if (lastView === 'overview' || lastView === 'settings') {
      if (lastView === 'overview') sessionStorage.setItem('fm.settingsTab', 'dashboard');
      replaceRoute({ kind: 'settings', agentId: current.agentId });
      return;
    }
    const stored = sessionStorage.getItem(lastClientKey);
    const restored = stored && list.some((c) => c.id === stored) ? stored : list[0]?.id;
    if (restored) replaceRoute({ kind: 'client', agentId: current.agentId, clientId: restored });
    else if (current.kind === 'client') replaceRoute({ kind: 'agent', agentId: current.agentId });
  }, [wsApi, lastClientKey, replaceRoute]);

  useEffect(() => {
    if (route.kind === 'client' && lastClientKey) sessionStorage.setItem(lastClientKey, route.clientId);
    if (route.kind === 'client' || route.kind === 'settings')
      sessionStorage.setItem('fm.lastView', route.kind);
  }, [route, lastClientKey]);

  useEffect(() => {
    loadClients().catch(console.error);
  }, [loadClients]);
  // Server-pushed roster refresh: the API streams a tick whenever this instance
  // gains or loses clients (import scan, daily auto-enroll, another tab), so the
  // sidebar fills the moment enrollment happens — no manual reload.
  useEffect(() => {
    if (!wsApi) return;
    let events: EventSource | null = null;
    let cancelled = false;
    wsApi.clientsEventsUrl().then((url) => {
      if (cancelled) return;
      events = new EventSource(url);
      events.onmessage = () => loadClients().catch(console.error);
    });
    return () => {
      cancelled = true;
      events?.close();
    };
  }, [wsApi, loadClients]);
  // Fire-and-forget variant for deep components (settings panels' "import now").
  const refreshClients = useCallback(() => {
    loadClients().catch(console.error);
  }, [loadClients]);
  useEffect(() => {
    api.mailboxStatus().then(setMailbox).catch(console.error);
  }, []);

  const clientDeleted = (client: Client) => {
    setDeleting(null);
    const remaining = clients.filter((c) => c.id !== client.id);
    setClients(remaining);
    const current = routeRef.current;
    if (current.kind === 'client' && current.clientId === client.id) {
      replaceRoute(
        remaining[0]
          ? { kind: 'client', agentId: current.agentId, clientId: remaining[0].id }
          : { kind: 'agent', agentId: current.agentId },
      );
    }
  };

  // Until the agent list arrives — or the boot route resolves to an agent —
  // there is no workspace to scope requests to.
  if (!agents || route.kind === 'boot') {
    return <div className="screen-center muted">{t.loading}</div>;
  }
  // The agents grid: an explicit "my agents" click, or the account has no
  // agents at all (the none-enabled message inside) — boot never lands here
  // otherwise.
  if (route.kind === 'home') {
    return <AgentsHome agents={agents} onSelectAgent={enterAgent} userEmail={userEmail} onLogout={onLogout} />;
  }
  // A route naming an agent this account doesn't have: the boot effect is
  // already rewriting it to the default.
  if (!agent || !wsApi) {
    return <div className="screen-center muted">{t.loading}</div>;
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
    <ClientsRefreshProvider value={refreshClients}>
    <div className="app">
      <div className="layout">
        <Sidebar
          agentName={agent.name}
          agentIcon={agentUI.icon}
          // Pinned surfaces are locked to one type; single-agent accounts have nothing to switch to.
          agentOptions={
            !pinnedAgentType && agents.length > 1
              ? agents.map((a) => ({ id: a.id, name: a.name, icon: getAgentUI(a.agentType).icon }))
              : undefined
          }
          activeAgentId={agent.id}
          onSwitchAgent={(agentId) => {
            const next = agents.find((a) => a.id === agentId);
            if (next) enterAgent(next);
          }}
          clients={clients}
          selectedClientId={route.kind === 'client' ? route.clientId : null}
          promptSelected={route.kind === 'prompt'}
          settingsSelected={route.kind === 'settings'}
          onSelectClient={(clientId) => navigate({ kind: 'client', agentId: agent.id, clientId })}
          onSelectPrompt={() => navigate({ kind: 'prompt', agentId: agent.id })}
          onSelectSettings={() => navigate({ kind: 'settings', agentId: agent.id })}
          onAddClient={agentUI.inboundOnlyClients || agentUI.importOnlyClients ? undefined : () => setAdding(true)}
          // Inbound-only agents are goal-less; their client dot shows the mute state instead.
          muteDots={agentUI.inboundOnlyClients}
          // The board→clients import is doc-collector behavior — agents that
          // connect monday differently (customer service: settings panel)
          // must not offer it, or their imports land in the wrong instance.
          onImportClients={renderImportPanel && agentUI.supportsBoardImport ? () => setImporting(true) : undefined}
          onDeleteClient={setDeleting}
          userEmail={userEmail}
          impersonatingEmail={impersonatingEmail ?? null}
          onStopImpersonating={onStopImpersonating}
          onLogout={onLogout}
        />
        <main className="main">
          {route.kind === 'client' && (
            <ClientView
              key={route.clientId}
              clientId={route.clientId}
              agentUI={agentUI}
              onClientUpdated={loadClients}
            />
          )}
          {route.kind === 'prompt' && impersonatingEmail && <PromptSettings />}
          {route.kind === 'settings' && (
            <Settings
              mailbox={mailbox}
              dashboard={
                <Overview
                  onSelectClient={(clientId) => navigate({ kind: 'client', agentId: agent.id, clientId })}
                />
              }
              agentPanel={agentUI.settingsPanel?.()}
              agentPanelTabKey={agentUI.settingsPanelTabKey}
              hideMailbox={!agentUI.channels.includes('email')}
            />
          )}
          {route.kind === 'agent' && (
            <div className="screen-center muted">
              {agentUI.inboundOnlyClients
                ? t.noClientsInboundWa
                : agentUI.importOnlyClients
                  ? t.noClientsImportOnly
                  : t.noClientsUseAdd}
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
          defaultDocuments={agentUI.defaultDocuments}
          onClose={() => setAdding(false)}
          onCreated={(client) => {
            setAdding(false);
            navigate({ kind: 'client', agentId: agent.id, clientId: client.id });
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
    </ClientsRefreshProvider>
    </WorkspaceApiProvider>
  );
}
