import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, type Client } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { DEFAULT_DOCUMENTS, type DocumentDraft } from '../defaultDocuments';
import { useT } from '../i18n';

interface Props {
  onCreated: (client: Client) => void;
  onClose: () => void;
  /** Name + email only — no documents/due-date (doc-collector concepts); see AgentTypeUI.simpleClientForm. */
  simple?: boolean;
  /** Lead paragraph for the simple form (AgentTypeUI.addClientLeadKey); defaults to the debt collector's copy. */
  leadKey?: MessageStringKey;
}

export function AddClientModal({ onCreated, onClose, simple = false, leadKey }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [documents, setDocuments] = useState<DocumentDraft[]>(simple ? [] : DEFAULT_DOCUMENTS);
  const [docDraft, setDocDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addDocument = () => {
    const trimmed = docDraft.trim();
    if (!trimmed || documents.some((d) => d.name === trimmed)) return;
    setDocuments([...documents, { name: trimmed }]);
    setDocDraft('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!simple && documents.length === 0) {
      setError(t.atLeastOneDoc);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { client } = await api.createClient({ name, email, phone: phone.trim() || null, documents, dueDate: dueDate || null });
      onCreated(client);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.createClientFailed);
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{t.addClientTitle}</h2>
        <p className="muted">{simple ? t[leadKey ?? 'addClientLeadDebt'] : t.addClientLead}</p>
        <label className="field">
          <span>{t.nameLabel}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>{t.emailLabel}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>{t.phoneLabel}</span>
          <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.waPhonePlaceholder} />
        </label>
        {!simple && (
        <>
        <label className="field">
          <span>{t.dueDateLabel}</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <div className="field">
          <span>{t.documentsToCollect}</span>
          {documents.length > 0 && (
            <ul className="doc-chip-list">
              {documents.map((doc) => (
                <li key={doc.name} className="doc-chip" title={doc.description ?? undefined}>
                  {doc.name}
                  <button
                    type="button"
                    className="chip-x"
                    title={t.removeNamed(doc.name)}
                    onClick={() => setDocuments(documents.filter((d) => d.name !== doc.name))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="doc-add-form">
            <input
              value={docDraft}
              onChange={(e) => setDocDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDocument();
                }
              }}
              placeholder={t.egForm106}
              aria-label={t.docNameAria}
            />
            <button type="button" className="btn btn-ghost" onClick={addDocument} disabled={!docDraft.trim()}>
              {t.addDocument}
            </button>
          </div>
        </div>
        </>
        )}
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t.creating : t.create}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
