import { useCallback, useEffect, useState } from 'react';
import { api, type Client, type GmailStatus } from './api';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ClientView } from './components/ClientView';
import { PromptSettings } from './components/PromptSettings';
import { AddClientModal } from './components/AddClientModal';

type View = { kind: 'client'; clientId: string } | { kind: 'prompt' } | { kind: 'empty' };

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [view, setView] = useState<View>({ kind: 'empty' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(({ authenticated }) => {
        setAuthed(authenticated);
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
    api.gmailStatus().then(setGmail).catch(console.error);
  }, [authed, loadClients]);

  if (authed === null) return <div className="screen-center muted">Loading…</div>;
  if (!authed) return <Login />;

  const logout = async () => {
    await api.logout();
    setAuthed(false);
    setClients([]);
    setView({ kind: 'empty' });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">FM</span>
          <span>
            FiscalMind <span className="muted">— Form 106 collection agent</span>
          </span>
        </div>
        <div className="topbar-actions">
          {gmail?.connected && (
            <span className="gmail-chip" title="Mailbox the agent sends and receives as">
              ✉ {gmail.emailAddress}
              <button
                className="chip-x"
                title="Disconnect this mailbox"
                onClick={async () => {
                  if (!window.confirm(`Disconnect ${gmail.emailAddress}? The agent will stop sending and receiving.`)) return;
                  await api.gmailDisconnect();
                  setGmail({ connected: false, emailAddress: null });
                }}
              >
                ×
              </button>
            </span>
          )}
          <button className="btn btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      {gmail && !gmail.connected && (
        <div className="connect-banner">
          <span>The agent has no mailbox yet — connect the Gmail account it should send and receive from.</span>
          <a className="btn btn-primary" href="/api/gmail/connect">
            Connect Gmail
          </a>
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
