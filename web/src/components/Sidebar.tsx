import type { Client } from '../api';

interface Props {
  clients: Client[];
  selectedClientId: string | null;
  promptSelected: boolean;
  onSelectClient: (clientId: string) => void;
  onSelectPrompt: () => void;
  onAddClient: () => void;
  onDeleteClient: (client: Client) => void;
  userEmail: string | null;
  agentMailbox: string | null;
  impersonatingEmail: string | null;
  onStopImpersonating: () => void;
  onLogout: () => void;
}

export function Sidebar({
  clients,
  selectedClientId,
  promptSelected,
  onSelectClient,
  onSelectPrompt,
  onAddClient,
  onDeleteClient,
  userEmail,
  agentMailbox,
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
            <li key={client.id} className="client-row">
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
              <button
                className="client-delete"
                title={`Delete ${client.name}`}
                onClick={() => onDeleteClient(client)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </li>
          ))}
          {clients.length === 0 && <li className="muted sidebar-empty">No clients yet</li>}
        </ul>
        <div className="sidebar-section">Agent settings</div>
        {/* Prompt tuning is an admin task — surfaced only inside an impersonated workspace. */}
        {impersonatingEmail && (
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
          <span className="footer-value">
            <span className="footer-email">{userEmail ?? '…'}</span>
          </span>
          <button className="btn btn-ghost btn-small footer-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
