import { useCallback, useEffect, useState } from 'react';
import { api, type Client, type MailboxStatus, type Me } from './api';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ClientView } from './components/ClientView';
import { PromptSettings } from './components/PromptSettings';
import { AddClientModal } from './components/AddClientModal';
import { DeleteClientModal } from './components/DeleteClientModal';
import { ClaimMailbox } from './components/ClaimMailbox';
import { AdminDashboard } from './components/AdminDashboard';
import { AccessPending } from './components/AccessPending';
import { Overview } from './components/Overview';

type View = { kind: 'overview' } | { kind: 'client'; clientId: string } | { kind: 'prompt' } | { kind: 'empty' };

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<Me['user'] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [whitelisted, setWhitelisted] = useState(false);
  const [impersonating, setImpersonating] = useState<Me['impersonating'] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Client | null>(null);

  // Admins have no agent, clients, or mailbox of their own — they get the platform
  // overview shell instead, and only enter the accountant workspace by impersonating.
  const adminMode = isAdmin && !impersonating;

  useEffect(() => {
    api
      .me()
      .then(({ authenticated, user: me, isAdmin: admin, whitelisted: allowed, impersonating: viewing }) => {
        setAuthed(authenticated);
        setUser(me ?? null);
        setIsAdmin(admin ?? false);
        setWhitelisted(allowed ?? false);
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
      // Restore the screen viewed before a refresh: the dashboard, or the client if it still exists.
      if (sessionStorage.getItem('fm.lastView') === 'overview') return { kind: 'overview' };
      const stored = sessionStorage.getItem('fm.lastClientId');
      const restored = stored && list.some((c) => c.id === stored) ? stored : list[0]?.id;
      return restored ? { kind: 'client', clientId: restored } : v;
    });
  }, []);

  useEffect(() => {
    if (view.kind === 'client') sessionStorage.setItem('fm.lastClientId', view.clientId);
    if (view.kind === 'client' || view.kind === 'overview') sessionStorage.setItem('fm.lastView', view.kind);
  }, [view]);

  useEffect(() => {
    if (!authed || !whitelisted || adminMode) return;
    loadClients().catch(console.error);
    api.mailboxStatus().then(setMailbox).catch(console.error);
  }, [authed, whitelisted, adminMode, loadClients]);

  if (authed === null) return <div className="screen-center muted">טוען…</div>;
  if (!authed) return <Login />;

  const logout = async () => {
    await api.logout();
    setAuthed(false);
    setUser(null);
    setIsAdmin(false);
    setWhitelisted(false);
    setImpersonating(null);
    setClients([]);
    setView({ kind: 'empty' });
  };

  if (!whitelisted) return <AccessPending userEmail={user?.email ?? null} onLogout={logout} />;

  if (adminMode) return <AdminDashboard userEmail={user?.email ?? null} onLogout={logout} />;

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
          <span>בחרו כתובת אימייל לסוכן — הלקוחות יתכתבו איתה.</span>
          <ClaimMailbox domain={mailbox.domain} onClaimed={setMailbox} />
        </div>
      )}
      <div className="layout">
        <Sidebar
          clients={clients}
          selectedClientId={view.kind === 'client' ? view.clientId : null}
          dashboardSelected={view.kind === 'overview'}
          promptSelected={view.kind === 'prompt'}
          onSelectClient={(clientId) => setView({ kind: 'client', clientId })}
          onSelectDashboard={() => setView({ kind: 'overview' })}
          onSelectPrompt={() => setView({ kind: 'prompt' })}
          onAddClient={() => setAdding(true)}
          onDeleteClient={setDeleting}
          userEmail={user?.email ?? null}
          agentMailbox={mailbox?.claimed ? mailbox.emailAddress : null}
          impersonatingEmail={impersonating?.email ?? null}
          onStopImpersonating={stopImpersonating}
          onLogout={logout}
        />
        <main className="main">
          {view.kind === 'overview' && (
            <Overview onSelectClient={(clientId) => setView({ kind: 'client', clientId })} />
          )}
          {view.kind === 'client' && (
            <ClientView key={view.clientId} clientId={view.clientId} onClientUpdated={loadClients} />
          )}
          {view.kind === 'prompt' && impersonating && <PromptSettings />}
          {view.kind === 'empty' && (
            <div className="screen-center muted">אין עדיין לקוחות — השתמשו בכפתור ה־+ שליד "לקוחות" בסרגל הצד.</div>
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
    </div>
  );
}
