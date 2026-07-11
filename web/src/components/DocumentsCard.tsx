import { useState, type FormEvent } from 'react';
import { ApiError, type ClientDocument } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT } from '../i18n';

interface Props {
  clientId: string;
  documents: ClientDocument[];
  onChanged: () => Promise<void>;
}

export function DocumentsCard({ clientId, documents, onChanged }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
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
      setError(err instanceof ApiError ? err.message : t.docsUpdateFailed);
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
    <section className="card panel">
      <div className="panel-header">
        <h3>{t.requiredDocuments}</h3>
        {documents.length > 0 && (
          <span className={`badge ${collected === documents.length ? 'badge-success' : 'badge-pending'}`}>
            {t.collectedBadge(collected, documents.length)}
          </span>
        )}
      </div>

      <div className="panel-body">
        {error && <div className="error-banner">{error}</div>}

        {documents.length === 0 ? (
          <p className="muted">{t.noDocsNothingToCollect}</p>
        ) : (
          <ul className="doc-list">
            {documents.map((doc) => (
              <li key={doc.id} className={`doc-row ${doc.status}`}>
                <label className="doc-check" title={doc.status === 'collected' ? t.markPending : t.markCollected}>
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
                  {doc.status === 'collected' ? t.collectedStatus : t.pendingStatus}
                </span>
                <button
                  className="chip-x"
                  title={t.removeDocument}
                  disabled={busy}
                  onClick={() => run(() => api.deleteDocument(clientId, doc.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="doc-add-form panel-footer" onSubmit={add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.docNamePlaceholder}
          aria-label={t.docNameAria}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.docDescPlaceholder}
          aria-label={t.docDescAria}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
          {t.addDocument}
        </button>
      </form>
    </section>
  );
}
