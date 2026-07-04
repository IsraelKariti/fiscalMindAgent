import type { Client } from '../api';

interface Props {
  clients: Client[];
  selectedClientId: string | null;
  promptSelected: boolean;
  adminSelected: boolean;
  onSelectClient: (clientId: string) => void;
  onSelectPrompt: () => void;
  onSelectAdmin: () => void;
  onAddClient: () => void;
  userEmail: string | null;
  agentMailbox: string | null;
  isAdmin: boolean;
  impersonatingEmail: string | null;
  onStopImpersonating: () => void;
  onLogout: () => void;
}

export function Sidebar({
  clients,
  selectedClientId,
  promptSelected,
  adminSelected,
  onSelectClient,
  onSelectPrompt,
  onSelectAdmin,
  onAddClient,
  userEmail,
  agentMailbox,
  isAdmin,
  impersonatingEmail,
  onStopImpersonating,
  onLogout,
}: Props) {
  return (
    <nav className="sidebar">
      <div className="brand sidebar-brand">
        <img className="brand-mark" src="/logo.png" alt="FiscalMind logo" />
        <span>FiscalMind</span>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section sidebar-section-row">
          <span>Clients</span>
          <button className="btn btn-ghost btn-small" onClick={onAddClient} title="Add a client">
            + Add
          </button>
        </div>
        <ul className="client-list">
          {clients.map((client) => (
            <li key={client.id}>
              <button
                className={`client-item ${client.id === selectedClientId ? 'selected' : ''}`}
                onClick={() => onSelectClient(client.id)}
              >
                <span className={`status-dot ${client.goal_status}`} title={`Goal ${client.goal_status}`} />
                <span className="client-item-text">
                  <span className="client-item-name">{client.name}</span>
                  <span className="client-item-email muted">{client.email_address}</span>
                </span>
              </button>
            </li>
          ))}
          {clients.length === 0 && <li className="muted sidebar-empty">No clients yet</li>}
        </ul>
        <div className="sidebar-section">Agent settings</div>
        {isAdmin && (
          <button className={`client-item ${promptSelected ? 'selected' : ''}`} onClick={onSelectPrompt}>
            <span className="client-item-name">System prompt</span>
          </button>
        )}
        <div className="agent-mailbox-row" title="Mailbox the agent sends and receives as">
          <span className="client-item-text">
            <span className="client-item-name">Agent mailbox</span>
            <span className="client-item-email muted">
              {agentMailbox ? `✉ ${agentMailbox}` : 'Not set — pick a name above'}
            </span>
          </span>
        </div>
        {isAdmin && !impersonatingEmail && (
          <>
            <div className="sidebar-section">Admin</div>
            <button className={`client-item ${adminSelected ? 'selected' : ''}`} onClick={onSelectAdmin}>
              <span className="client-item-name">Users</span>
            </button>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        {impersonatingEmail && (
          <div className="footer-row impersonation-row" title="You are viewing this user's dashboard as admin">
            <span className="footer-label">Impersonating</span>
            <span className="footer-value footer-user">
              <span className="footer-email">{impersonatingEmail}</span>
              <button className="btn btn-ghost btn-small" onClick={onStopImpersonating}>
                Exit
              </button>
            </span>
          </div>
        )}
        <div className="footer-row" title="Google account you are signed in with">
          <span className="footer-label">Signed in as</span>
          <span className="footer-value footer-user">
            <span className="footer-email">{userEmail ?? '…'}</span>
            <button className="btn btn-ghost btn-small" onClick={onLogout}>
              Log out
            </button>
          </span>
        </div>
      </div>
    </nav>
  );
}
