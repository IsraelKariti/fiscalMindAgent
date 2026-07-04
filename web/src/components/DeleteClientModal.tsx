import { useState } from 'react';
import { api, ApiError, type Client } from '../api';

interface Props {
  client: Client;
  onDeleted: (client: Client) => void;
  onClose: () => void;
}

export function DeleteClientModal({ client, onDeleted, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteClient(client.id);
      onDeleted(client);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'מחיקת הלקוח נכשלה.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h2>
          למחוק את <span className="modal-highlight">{client.name}</span>?
        </h2>
        <p className="muted">גם המיילים, המסמכים והקבצים של הלקוח יימחקו. לא ניתן לבטל את הפעולה.</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button className="btn btn-danger" type="button" onClick={confirm} disabled={busy} autoFocus>
            {busy ? 'מוחק…' : 'מחיקת הלקוח'}
          </button>
        </div>
      </div>
    </div>
  );
}
