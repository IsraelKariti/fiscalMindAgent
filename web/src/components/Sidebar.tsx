import { useRef, useState } from 'react';
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

const icon = {
  mail: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  copy: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  check: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  ),
  sliders: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  eye: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

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
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();

  const copyMailbox = async () => {
    if (!agentMailbox) return;
    await navigator.clipboard.writeText(agentMailbox);
    setCopied(true);
    clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <nav className="sidebar">
      <div className="brand sidebar-brand">
        <img className="brand-mark" src="/logo.png" alt="FiscalMind logo" />
        <span>FiscalMind</span>
      </div>

      {/* Workspace identity: the mailbox clients correspond with. Info, not navigation. */}
      <div className="id-card" title="Mailbox the agent sends and receives as">
        <span className="id-card-icon">{icon.mail}</span>
        <span className="id-card-text">
          <span className="microlabel">Agent mailbox</span>
          <span className={`id-card-value ${agentMailbox ? '' : 'muted'}`}>
            {agentMailbox ?? 'Not set up yet'}
          </span>
        </span>
        {agentMailbox && (
          <button
            className={`icon-btn ${copied ? 'icon-btn-success' : ''}`}
            onClick={copyMailbox}
            title={copied ? 'Copied!' : 'Copy address'}
          >
            {copied ? icon.check : icon.copy}
          </button>
        )}
      </div>

      <div className="sidebar-scroll">
        <div className="side-heading">
          <span className="side-heading-label">
            Clients
            {clients.length > 0 && <span className="side-count">{clients.length}</span>}
          </span>
          <span className="side-heading-rule" />
          <button className="icon-btn" onClick={onAddClient} title="Add a client">
            {icon.plus}
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

        {/* Prompt tuning is an admin task — surfaced only inside an impersonated workspace. */}
        {impersonatingEmail && (
          <>
            <div className="side-heading">
              <span className="side-heading-label">Admin tools</span>
              <span className="side-heading-rule" />
            </div>
            <button className={`client-item ${promptSelected ? 'selected' : ''}`} onClick={onSelectPrompt}>
              <span className="nav-item-icon">{icon.sliders}</span>
              <span className="client-item-name">System prompt</span>
            </button>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        {impersonatingEmail && (
          <div className="id-card impersonation-card" title="You are viewing this user's dashboard as admin">
            <span className="id-card-icon">{icon.eye}</span>
            <span className="id-card-text">
              <span className="microlabel">Viewing as</span>
              <span className="id-card-value">{impersonatingEmail}</span>
            </span>
            <button className="btn btn-ghost btn-small" onClick={onStopImpersonating}>
              Exit
            </button>
          </div>
        )}
        <div className="account-row" title="Google account you are signed in with">
          <span className="avatar">{(userEmail?.[0] ?? '·').toUpperCase()}</span>
          <span className="id-card-text">
            <span className="microlabel">Signed in</span>
            <span className="id-card-value">{userEmail ?? '…'}</span>
          </span>
          <button className="icon-btn" onClick={onLogout} title="Log out">
            {icon.logout}
          </button>
        </div>
      </div>
    </nav>
  );
}
