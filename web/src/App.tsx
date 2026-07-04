import { useCallback, useEffect, useState } from 'react';
import { api, type Client, type MailboxStatus, type Me } from './api';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ClientView } from './components/ClientView';
import { PromptSettings } from './components/PromptSettings';
import { AddClientModal } from './components/AddClientModal';
import { DeleteClientModal } from './components/DeleteClientModal';
import { ClaimMailbox } from './components/ClaimMailbox';
import { AdminUsers } from './components/AdminUsers';

type View = { kind: 'client'; clientId: string } | { kind: 'prompt' } | { kind: 'admin' } | { kind: 'empty' };

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<Me['user'] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [impersonating, setImpersonating] = useState<Me['impersonating'] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Client | null>(null);

  useEffect(() => {
    api
      .me()
      .then(({ authenticated, user: me, isAdmin: admin, impersonating: viewing }) => {
        setAuthed(authenticated);
        setUser(me ?? null);
        setIsAdmin(admin ?? false);
        setImpersonating(viewing ?? null);
        // Drop a stale ?login_error= once signed in.
        if (authenticated && window.location.search) window.history.replaceState(null, '', '/');
      })
      .catch(() => setAuthed(false));
  }, []);

  const loadClients = useCallback(async () => {
    const { clients: list } = await api.listClients();
    setClients(list);
    setView((v) => (v.kind === 'empty' && list[0] ? { kind: 'client', clientId: list[0].id } : v));
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadClients().catch(console.error);
    api.mailboxStatus().then(setMailbox).catch(console.error);
  }, [authed, loadClients]);

  if (authed === null) return <div className="screen-center muted">Loading…</div>;
  if (!authed) return <Login />;

  const logout = async () => {
    await api.logout();
    setAuthed(false);
    setUser(null);
    setClients([]);
    setView({ kind: 'empty' });
  };

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
    // Full reload so every view refetches under the admin's own identity.
    window.location.reload();
  };

  return (
    <div className="app">
      {mailbox && !mailbox.claimed && (
        <div className="connect-banner">
          <span>Pick your agent's email address — clients will correspond with it.</span>
          <ClaimMailbox domain={mailbox.domain} onClaimed={setMailbox} />
        </div>
      )}
      <div className="layout">
        <Sidebar
          clients={clients}
          selectedClientId={view.kind === 'client' ? view.clientId : null}
          promptSelected={view.kind === 'prompt'}
          adminSelected={view.kind === 'admin'}
          onSelectClient={(clientId) => setView({ kind: 'client', clientId })}
          onSelectPrompt={() => setView({ kind: 'prompt' })}
          onSelectAdmin={() => setView({ kind: 'admin' })}
          onAddClient={() => setAdding(true)}
          onDeleteClient={setDeleting}
          userEmail={user?.email ?? null}
          agentMailbox={mailbox?.claimed ? mailbox.emailAddress : null}
          isAdmin={isAdmin}
          impersonatingEmail={impersonating?.email ?? null}
          onStopImpersonating={stopImpersonating}
          onLogout={logout}
        />
        <main className="main">
          {view.kind === 'client' && (
            <ClientView key={view.clientId} clientId={view.clientId} onClientUpdated={loadClients} />
          )}
          {view.kind === 'prompt' && isAdmin && <PromptSettings />}
          {view.kind === 'admin' && <AdminUsers ownUserId={user?.id ?? ''} />}
          {view.kind === 'empty' && (
            <div className="screen-center muted">No clients yet — use “+ Add” in the sidebar to create one.</div>
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
