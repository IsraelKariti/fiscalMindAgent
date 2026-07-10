import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type AccountTier, type Client, type MailboxStatus } from '../api';
import { Sidebar } from './Sidebar';
import { ClientView } from './ClientView';
import { PromptSettings } from './PromptSettings';
import { AddClientModal } from './AddClientModal';
import { DeleteClientModal } from './DeleteClientModal';
import { ClaimMailbox } from './ClaimMailbox';
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
}: Props) {
  const { t } = useT();
  const [clients, setClients] = useState<Client[]>([]);
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Client | null>(null);

  const loadClients = useCallback(async () => {
    const { clients: list } = await api.listClients();
    setClients(list);
    setView((v) => {
      if (v.kind !== 'empty') return v;
      // Restore the screen viewed before a refresh: the dashboard, settings, or the client if it still exists.
      const lastView = sessionStorage.getItem('fm.lastView');
      if (lastView === 'overview') return { kind: 'overview' };
      if (lastView === 'settings') return { kind: 'settings' };
      const stored = sessionStorage.getItem('fm.lastClientId');
      const restored = stored && list.some((c) => c.id === stored) ? stored : list[0]?.id;
      return restored ? { kind: 'client', clientId: restored } : v;
    });
  }, []);

  useEffect(() => {
    if (view.kind === 'client') sessionStorage.setItem('fm.lastClientId', view.clientId);
    if (view.kind === 'client' || view.kind === 'overview' || view.kind === 'settings')
      sessionStorage.setItem('fm.lastView', view.kind);
  }, [view]);

  useEffect(() => {
    loadClients().catch(console.error);
    api.mailboxStatus().then(setMailbox).catch(console.error);
  }, [loadClients]);

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

  return (
    <div className="app">
      {mailbox && !mailbox.claimed && (
        <div className="connect-banner">
          <span>{t.connectBanner}</span>
          <ClaimMailbox domain={mailbox.domain} onClaimed={setMailbox} />
        </div>
      )}
      <div className="layout">
        <Sidebar
          clients={clients}
          selectedClientId={view.kind === 'client' ? view.clientId : null}
          dashboardSelected={view.kind === 'overview'}
          promptSelected={view.kind === 'prompt'}
          settingsSelected={view.kind === 'settings'}
          onSelectClient={(clientId) => setView({ kind: 'client', clientId })}
          onSelectDashboard={() => setView({ kind: 'overview' })}
          onSelectPrompt={() => setView({ kind: 'prompt' })}
          onSelectSettings={() => setView({ kind: 'settings' })}
          onAddClient={() => setAdding(true)}
          onImportClients={renderImportPanel ? () => setImporting(true) : undefined}
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
              onClientUpdated={loadClients}
              tier={tier}
              contactEmail={contactEmail}
            />
          )}
          {view.kind === 'prompt' && impersonatingEmail && <PromptSettings />}
          {view.kind === 'settings' && (
            <Settings mailbox={mailbox} onClaimed={setMailbox} tier={tier} contactEmail={contactEmail} />
          )}
          {view.kind === 'empty' && (
            <div className="screen-center muted">{t.noClientsUseAdd}</div>
          )}
        </main>
      </div>
      {deleting && (
        <DeleteClientModal client={deleting} onClose={() => setDeleting(null)} onDeleted={clientDeleted} />
      )}
      {adding && (
        <AddClientModal
          onClose={() => setAdding(false)}
          onCreated={(client) => {
            setAdding(false);
            setView({ kind: 'client', clientId: client.id });
            loadClients().catch(console.error);
          }}
        />
      )}
      {importing && renderImportPanel && (
        <div className="modal-backdrop" onClick={() => setImporting(false)}>
          <div className="card modal modal-import" onClick={(e) => e.stopPropagation()}>
            {renderImportPanel({
              onImported: () => loadClients().catch(console.error),
              onClose: () => setImporting(false),
            })}
          </div>
        </div>
      )}
    </div>
  );
}
