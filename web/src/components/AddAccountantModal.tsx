import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useT } from '../i18n';

interface Props {
  onAdded: () => void;
  onClose: () => void;
}

/** Whitelists a paying accountant's email so they can use the app. */
export function AddAccountantModal({ onAdded, onClose }: Props) {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.adminAddToWhitelist(email.trim().toLowerCase(), name.trim() || undefined);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.addAccountantFailed);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{t.addAccountantTitle}</h2>
        <p className="muted">{t.addAccountantLead}</p>
        <label className="field">
          <span>{t.googleEmail}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="accountant@gmail.com"
            spellCheck={false}
            autoFocus
            required
          />
        </label>
        <label className="field">
          <span>{t.nameOptional}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t.adding : t.addAccountantTitle}
          </button>
        </div>
      </form>
    </div>
  );
}
