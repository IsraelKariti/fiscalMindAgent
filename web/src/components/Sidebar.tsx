import type { Client } from '../api';

interface Props {
  clients: Client[];
  selectedClientId: string | null;
  promptSelected: boolean;
  onSelectClient: (clientId: string) => void;
  onSelectPrompt: () => void;
  onAddClient: () => void;
}

export function Sidebar({ clients, selectedClientId, promptSelected, onSelectClient, onSelectPrompt, onAddClient }: Props) {
  return (
    <nav className="sidebar">
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
      <div className="sidebar-section">Settings</div>
      <button className={`client-item ${promptSelected ? 'selected' : ''}`} onClick={onSelectPrompt}>
        <span className="client-item-name">System prompt</span>
      </button>
    </nav>
  );
}
