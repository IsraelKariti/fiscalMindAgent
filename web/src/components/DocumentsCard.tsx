import { useState, type FormEvent } from 'react';
import { api, ApiError, type ClientDocument } from '../api';

interface Props {
  clientId: string;
  documents: ClientDocument[];
  onChanged: () => Promise<void>;
}

export function DocumentsCard({ clientId, documents, onChanged }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collected = documents.filter((d) => d.status === 'collected').length;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update documents.');
    } finally {
      setBusy(false);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    run(async () => {
      await api.addDocument(clientId, { name: trimmed, description: description.trim() || null });
      setName('');
      setDescription('');
    });
  };

  return (
    <section className="card">
      <div className="card-header">
        <h3>Required documents</h3>
        {documents.length > 0 && (
          <span className={`badge ${collected === documents.length ? 'badge-success' : 'badge-pending'}`}>
            {collected} / {documents.length} collected
          </span>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {documents.length === 0 ? (
        <p className="muted">No documents configured — the agent has nothing to collect from this client.</p>
      ) : (
        <ul className="doc-list">
          {documents.map((doc) => (
            <li key={doc.id} className={`doc-row ${doc.status}`}>
              <label className="doc-check" title={doc.status === 'collected' ? 'Mark as pending' : 'Mark as collected'}>
                <input
                  type="checkbox"
                  checked={doc.status === 'collected'}
                  disabled={busy}
                  onChange={() =>
                    run(() =>
                      api.updateDocument(clientId, doc.id, {
                        status: doc.status === 'collected' ? 'pending' : 'collected',
                      }),
                    )
                  }
                />
                <span className="doc-text">
                  <span className="doc-name">{doc.name}</span>
                  {doc.description && <span className="doc-desc muted">{doc.description}</span>}
                </span>
              </label>
              <span className={`badge ${doc.status === 'collected' ? 'badge-success' : 'badge-pending'}`}>
                {doc.status}
              </span>
              <button
                className="chip-x"
                title="Remove document"
                disabled={busy}
                onClick={() => run(() => api.deleteDocument(clientId, doc.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="doc-add-form" onSubmit={add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Document name, e.g. Form 106"
          aria-label="Document name"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional, helps the agent explain it)"
          aria-label="Document description"
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
          Add document
        </button>
      </form>
    </section>
  );
}
