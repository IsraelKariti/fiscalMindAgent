import { useCallback, useEffect, useState } from 'react';
import { api, type Client, type MailboxStatus, type Me } from './api';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ClientView } from './components/ClientView';
import { PromptSettings } from './components/PromptSettings';
import { AddClientModal } from './components/AddClientModal';
import { ClaimMailbox } from './components/ClaimMailbox';

type View = { kind: 'client'; clientId: string } | { kind: 'prompt' } | { kind: 'empty' };

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<Me['user'] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(({ authenticated, user: me }) => {
        setAuthed(authenticated);
        setUser(me ?? null);
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
          onSelectClient={(clientId) => setView({ kind: 'client', clientId })}
          onSelectPrompt={() => setView({ kind: 'prompt' })}
          onAddClient={() => setAdding(true)}
          userEmail={user?.email ?? null}
          agentMailbox={mailbox?.claimed ? mailbox.emailAddress : null}
          onLogout={logout}
        />
        <main className="main">
          {view.kind === 'client' && (
            <ClientView key={view.clientId} clientId={view.clientId} onClientUpdated={loadClients} />
          )}
          {view.kind === 'prompt' && <PromptSettings />}
          {view.kind === 'empty' && (
            <div className="screen-center muted">No clients yet — use “+ Add” in the sidebar to create one.</div>
          )}
        </main>
      </div>
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
