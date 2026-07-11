import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, type Client } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT } from '../i18n';

interface Props {
  client: Client;
  onDeleted: (client: Client) => void;
  onClose: () => void;
}

export function DeleteClientModal({ client, onDeleted, onClose }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteClient(client.id);
      onDeleted(client);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.deleteClientFailed);
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h2>
          {t.deleteQuestionPrefix}
          <span className="modal-highlight">{client.name}</span>
          {t.deleteQuestionSuffix}
        </h2>
        <p className="muted">{t.deleteWarning}</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-danger" type="button" onClick={confirm} disabled={busy} autoFocus>
            {busy ? t.deleting : t.deleteClient}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
