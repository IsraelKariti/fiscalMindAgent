import { useState, type FormEvent } from 'react';
import { ApiError, type ClientDocument, type DocumentFile } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { FileViewModal } from './FileViewModal';
import { useT } from '../i18n';

interface Props {
  clientId: string;
  documents: ClientDocument[];
  /** Received files — a row whose checklist item has a linked file gets view/download buttons. */
  files: DocumentFile[];
  onChanged: () => Promise<void>;
  /** Panel title override — agents where the list isn't accountant-defined rename it. */
  titleKey?: MessageStringKey;
  /** Empty-state override — for agents whose list starts empty by design. */
  emptyTextKey?: MessageStringKey;
}

export function DocumentsCard({ clientId, documents, files, onChanged, titleKey, emptyTextKey }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DocumentFile | null>(null);

  // Newest linked file wins (the list arrives created_at ascending).
  const latestFileFor = (docId: string): DocumentFile | null => {
    for (let i = files.length - 1; i >= 0; i--) {
      const file = files[i];
      if (file && file.client_document_id === docId) return file;
    }
    return null;
  };

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
        <h3>{t[titleKey ?? 'requiredDocuments']}</h3>
        {documents.length > 0 && (
          <span className={`badge ${collected === documents.length ? 'badge-success' : 'badge-pending'}`}>
            {t.collectedBadge(collected, documents.length)}
          </span>
        )}
      </div>

      <div className="panel-body">
        {error && <div className="error-banner">{error}</div>}

        {documents.length === 0 ? (
          <p className="muted">{t[emptyTextKey ?? 'noDocsNothingToCollect']}</p>
        ) : (
          <ul className="doc-list">
            {documents.map((doc) => {
              const file = latestFileFor(doc.id);
              return (
              <li key={doc.id} className={`doc-row ${doc.status}`}>
                <label
                  className="doc-check"
                  title={
                    doc.status === 'collected'
                      ? t.markPending
                      : doc.status === 'claimed'
                        ? t.confirmClaimedTitle
                        : t.markCollected
                  }
                >
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
                {file && (
                  <span className="doc-actions">
                    <button className="icon-btn" type="button" title={t.viewFile} onClick={() => setViewing(file)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      className="icon-btn"
                      type="button"
                      title={t.downloadFile}
                      onClick={async () => window.location.assign(await api.fileDownloadUrl(clientId, file.id))}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  </span>
                )}
                <span
                  className={`badge ${
                    doc.status === 'collected' ? 'badge-success' : doc.status === 'claimed' ? 'badge-warning' : 'badge-pending'
                  }`}
                >
                  {doc.status === 'collected' ? t.collectedStatus : doc.status === 'claimed' ? t.claimedStatus : t.pendingStatus}
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
              );
            })}
          </ul>
        )}
        {viewing && <FileViewModal clientId={clientId} file={viewing} onClose={() => setViewing(null)} />}
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
