import { useCallback, useEffect, useState } from 'react';
import { api, type Client } from './api';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { ClientView } from './components/ClientView';
import { PromptSettings } from './components/PromptSettings';

type View = { kind: 'client'; clientId: string } | { kind: 'prompt' } | { kind: 'empty' };

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [view, setView] = useState<View>({ kind: 'empty' });

  useEffect(() => {
    api
      .me()
      .then(({ authenticated }) => setAuthed(authenticated))
      .catch(() => setAuthed(false));
  }, []);

  const loadClients = useCallback(async () => {
    const { clients: list } = await api.listClients();
    setClients(list);
    setView((v) => (v.kind === 'empty' && list[0] ? { kind: 'client', clientId: list[0].id } : v));
  }, []);

  useEffect(() => {
    if (authed) loadClients().catch(console.error);
  }, [authed, loadClients]);

  if (authed === null) return <div className="screen-center muted">Loading…</div>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

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
        <button className="btn btn-ghost" onClick={logout}>
          Log out
        </button>
      </header>
      <div className="layout">
        <Sidebar
          clients={clients}
          selectedClientId={view.kind === 'client' ? view.clientId : null}
          promptSelected={view.kind === 'prompt'}
          onSelectClient={(clientId) => setView({ kind: 'client', clientId })}
          onSelectPrompt={() => setView({ kind: 'prompt' })}
        />
        <main className="main">
          {view.kind === 'client' && (
            <ClientView key={view.clientId} clientId={view.clientId} onClientUpdated={loadClients} />
          )}
          {view.kind === 'prompt' && <PromptSettings />}
          {view.kind === 'empty' && (
            <div className="screen-center muted">
              No clients yet. Create one with <code>npm run cli:bootstrap</code>.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
