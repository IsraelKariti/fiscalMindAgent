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

/** The view/download icon pair for one received file. */
function FileActions({ clientId, file, onView }: { clientId: string; file: DocumentFile; onView: (file: DocumentFile) => void }) {
  const { t } = useT();
  const api = useWorkspaceApi();
  return (
    <span className="doc-actions">
      <button className="icon-btn" type="button" title={t.viewFile} onClick={() => onView(file)}>
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
  );
}

export function DocumentsCard({ clientId, documents, files, onChanged, titleKey, emptyTextKey }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DocumentFile | null>(null);

  // All files linked to a checklist item, oldest first (the list arrives
  // created_at ascending). A tax-fetched multi-employer year links several
  // 106s to the one item — every one of them must stay visible.
  const filesFor = (docId: string): DocumentFile[] => files.filter((f) => f.client_document_id === docId);

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
              const linked = filesFor(doc.id);
              // A lone unlabeled file keeps the compact inline icons; labeled
              // files (tax-fetched 106s carry the employer name) or several
              // files get one line each so all of them stay visible.
              const showFileList = linked.length > 1 || Boolean(linked[0]?.label);
              const inlineFile = showFileList ? null : (linked[0] ?? null);
              return (
              <li key={doc.id} className={`doc-row ${doc.status}`}>
                <div className="doc-row-main">
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
                {inlineFile && <FileActions clientId={clientId} file={inlineFile} onView={setViewing} />}
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
                </div>
                {showFileList && (
                  <ul className="doc-file-list">
                    {linked.map((file) => (
                      <li key={file.id} className="doc-file-item">
                        <span className="doc-file-label" title={file.filename}>
                          {file.label ?? file.filename}
                        </span>
                        <FileActions clientId={clientId} file={file} onView={setViewing} />
                      </li>
                    ))}
                  </ul>
                )}
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
