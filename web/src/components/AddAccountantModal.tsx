import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

interface Props {
  onAdded: () => void;
  onClose: () => void;
}

/** Whitelists a paying accountant's email so they can use the app. */
export function AddAccountantModal({ onAdded, onClose }: Props) {
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
      setError(err instanceof ApiError ? err.message : 'הוספת רואה החשבון נכשלה.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>הוספת רואה חשבון</h2>
        <p className="muted">
          הוסיפו את כתובת ה־Gmail שאיתה רואה החשבון יתחבר. הגישה נפתחת ברגע ההוספה — אפשר להתחבר מייד.
        </p>
        <label className="field">
          <span>אימייל Google</span>
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
          <span>שם (אופציונלי)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'מוסיף…' : 'הוספת רואה חשבון'}
          </button>
        </div>
      </form>
    </div>
  );
}
