import { useCallback, useEffect, useState } from 'react';
import { api, type AccountTier, type Client, type MailboxStatus, type Me } from './api';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ClientView } from './components/ClientView';
import { PromptSettings } from './components/PromptSettings';
import { AddClientModal } from './components/AddClientModal';
import { DeleteClientModal } from './components/DeleteClientModal';
import { ClaimMailbox } from './components/ClaimMailbox';
import { AdminDashboard } from './components/AdminDashboard';
import { AccessPending } from './components/AccessPending';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { Overview } from './components/Overview';
import { Settings } from './components/Settings';
import { useT } from './i18n';

type View =
  | { kind: 'overview' }
  | { kind: 'client'; clientId: string }
  | { kind: 'prompt' }
  | { kind: 'settings' }
  | { kind: 'empty' };

export function App() {
  const { t } = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<Me['user'] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [whitelisted, setWhitelisted] = useState(false);
  const [tier, setTier] = useState<AccountTier | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<Me['impersonating'] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // Admins have no agent, clients, or mailbox of their own — they get the platform
  // overview shell instead, and only enter the accountant workspace by impersonating.
  const adminMode = isAdmin && !impersonating;

  useEffect(() => {
    api
      .me()
      .then(({ authenticated, user: me, isAdmin: admin, whitelisted: allowed, tier: planTier, contactEmail: contact, impersonating: viewing }) => {
        setAuthed(authenticated);
        setUser(me ?? null);
        setIsAdmin(admin ?? false);
        setWhitelisted(allowed ?? false);
        setTier(planTier ?? null);
        setContactEmail(contact ?? null);
        setImpersonating(viewing ?? null);
        // Drop a stale ?login_error= once signed in.
        if (authenticated && window.location.search) window.history.replaceState(null, '', '/');
      })
      .catch(() => setAuthed(false));
  }, []);

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
    if (!authed || !whitelisted || adminMode) return;
    loadClients().catch(console.error);
    api.mailboxStatus().then(setMailbox).catch(console.error);
  }, [authed, whitelisted, adminMode, loadClients]);

  if (authed === null) return <div className="screen-center muted">{t.loading}</div>;
  if (!authed) return <Login />;

  const logout = async () => {
    await api.logout();
    setConfirmingLogout(false);
    setAuthed(false);
    setUser(null);
    setIsAdmin(false);
    setWhitelisted(false);
    setImpersonating(null);
    setClients([]);
    setView({ kind: 'empty' });
  };

  // The logout buttons only open the confirmation modal; `logout` runs on confirm.
  const requestLogout = () => setConfirmingLogout(true);
  const logoutModal = confirmingLogout && (
    <LogoutConfirmModal onConfirm={logout} onClose={() => setConfirmingLogout(false)} />
  );

  if (!whitelisted) return <AccessPending userEmail={user?.email ?? null} onLogout={logout} />;

  if (adminMode)
    return (
      <>
        <AdminDashboard userEmail={user?.email ?? null} onLogout={requestLogout} />
        {logoutModal}
      </>
    );

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

  const stopImpersonating = async () => {
    await api.stopImpersonating();
    // Full reload so the admin lands back on their own dashboard with fresh state.
    window.location.reload();
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
          onDeleteClient={setDeleting}
          userEmail={user?.email ?? null}
          tier={tier}
          impersonatingEmail={impersonating?.email ?? null}
          onStopImpersonating={stopImpersonating}
          onLogout={requestLogout}
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
          {view.kind === 'prompt' && impersonating && <PromptSettings />}
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
      {logoutModal}
    </div>
  );
}
