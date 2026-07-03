import { useState, type FormEvent } from 'react';
import { api, ApiError, type Client } from '../api';

interface Props {
  onCreated: (client: Client) => void;
  onClose: () => void;
}

export function AddClientModal({ onCreated, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('Form 106 needed for your filing');
  const [body, setBody] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { client } = await api.createClient({ name, email, subject, body, delayMinutes });
      onCreated(client);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create client.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Add client</h2>
        <p className="muted">
          The agent sends the first email after the chosen delay, then manages follow-ups on its own.
        </p>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>First email subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </label>
        <label className="field">
          <span>First email body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required />
        </label>
        <label className="field">
          <span>Send after (minutes)</span>
          <input
            type="number"
            min={0}
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(Number(e.target.value))}
            required
          />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create & schedule'}
          </button>
        </div>
      </form>
    </div>
  );
}
