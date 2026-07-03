import { useState } from 'react';
import { api, type Client } from '../api';

interface Props {
  client: Client;
  onSaved: (client: Client) => Promise<void>;
}

interface Draft {
  name: string;
  occupation: string;
  phone: string;
  company: string;
  notes: string;
}

function toDraft(client: Client): Draft {
  return {
    name: client.name,
    occupation: client.occupation ?? '',
    phone: client.phone ?? '',
    company: client.company ?? '',
    notes: client.notes ?? '',
  };
}

export function ClientCard({ client, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(client));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [field]: e.target.value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { client: updated } = await api.updateClient(client.id, {
        name: draft.name.trim() || client.name,
        occupation: draft.occupation.trim() || null,
        phone: draft.phone.trim() || null,
        company: draft.company.trim() || null,
        notes: draft.notes.trim() || null,
      });
      await onSaved(updated);
      setEditing(false);
    } catch {
      setError('Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card client-card">
      <div className="card-header">
        <div>
          <h2>{client.name}</h2>
          <span className={`badge ${client.goal_status === 'complete' ? 'badge-success' : 'badge-pending'}`}>
            {client.goal_status === 'complete' ? 'All documents received' : 'Collecting documents'}
          </span>
        </div>
        {!editing ? (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setDraft(toDraft(client));
              setEditing(true);
            }}
          >
            Edit
          </button>
        ) : (
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!editing ? (
        <dl className="detail-grid">
          <div>
            <dt>Email</dt>
            <dd>{client.email_address}</dd>
          </div>
          <div>
            <dt>Occupation</dt>
            <dd>{client.occupation ?? <span className="muted">—</span>}</dd>
          </div>
          <div>
            <dt>Company</dt>
            <dd>{client.company ?? <span className="muted">—</span>}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{client.phone ?? <span className="muted">—</span>}</dd>
          </div>
          <div>
            <dt>Engagement started</dt>
            <dd>{new Date(client.created_at).toLocaleDateString()}</dd>
          </div>
          <div className="detail-wide">
            <dt>Notes</dt>
            <dd>{client.notes ?? <span className="muted">—</span>}</dd>
          </div>
        </dl>
      ) : (
        <div className="detail-grid">
          <label className="field">
            <span>Name</span>
            <input value={draft.name} onChange={set('name')} />
          </label>
          <label className="field">
            <span>Occupation</span>
            <input value={draft.occupation} onChange={set('occupation')} placeholder="e.g. Software engineer" />
          </label>
          <label className="field">
            <span>Company</span>
            <input value={draft.company} onChange={set('company')} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={draft.phone} onChange={set('phone')} />
          </label>
          <label className="field detail-wide">
            <span>Notes</span>
            <textarea value={draft.notes} onChange={set('notes')} rows={3} />
          </label>
        </div>
      )}
    </section>
  );
}
